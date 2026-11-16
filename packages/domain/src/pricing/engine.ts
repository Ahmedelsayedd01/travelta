import type { CurrencyCode, InventorySource, MarkupLayer, MarkupMode, ServiceType, SupplierOwnership } from '@travelta/contracts';
import type {
  BreakdownLine, CommercialSettingsEntity, CustomerType, FeeRuleEntity, FxSnapshot, MarkupRuleEntity, NetLine, PriceBreakdown,
  RoundingRule, TaxProfileEntity,
} from '@travelta/schemas';
import { CURRENCIES, allocate, convert, divRoundHalfUp, money, percentOf, toMinor } from '@travelta/shared';
import { resolveRule, type MatchContext, type ResolvedRule } from './resolve';

export const ENGINE_VERSION = 'pricing-1.0.0';

export interface LayerConfig {
  /** Organization that owns this layer's rules and settings. */
  tenantId: string;
  settings: CommercialSettingsEntity | null;
}

export interface DiscountInput {
  label: string;
  mode: MarkupMode;
  /** Percent, or a fixed amount in major units of the pricing currency. */
  value: number;
  /** The party whose margin funds the discount (PRC-11). */
  fundedBy: 'platform' | 'agency' | 'sub_agency';
  ref?: string;
}

/** Permission-checked by the caller (pricing.override_markup / override_guardrails). */
export interface LayerOverride {
  layer: MarkupLayer;
  mode: MarkupMode;
  value: number;
  by: string;
  reason: string;
  /** Only with pricing.override_guardrails (platform). */
  breakGuardrails?: boolean;
}

export interface PricingInput {
  serviceType: ServiceType;
  source: InventorySource;
  ownership: SupplierOwnership;
  supplierId: string;
  productId: string | null;
  destinationId: string | null;
  nationalityGroupId: string | null;
  customerType: CustomerType;
  channel: 'b2b' | 'b2c';
  bookingDate: string;
  travelDate: string;
  currency: CurrencyCode;
  lines: NetLine[];
  platform: LayerConfig;
  /** The agency layer: an agency, or the platform's retail org (Travelta Direct) for platform B2C (PRC-6). */
  agency: LayerConfig;
  subAgency: LayerConfig | null;
  rules: readonly MarkupRuleEntity[];
  /** Tax profiles and fee rules of the FINAL seller. */
  taxProfiles: readonly TaxProfileEntity[];
  feeRules: readonly FeeRuleEntity[];
  commission: { pct: number; beneficiary: 'platform' | 'agency' | 'none' };
  fx: (from: CurrencyCode, to: CurrencyCode) => { rate: number; date: string } | null;
  discounts?: DiscountInput[];
  overrides?: LayerOverride[];
  /** PRC-9 override_price: target pre-tax customer price; the final seller's markup absorbs the difference. */
  finalPrice?: { preTaxMinor: number; by: string; reason: string; breakGuardrails?: boolean };
  now: string;
}

export class PricingError extends Error {
  constructor(readonly code: 'FX_UNAVAILABLE' | 'INVARIANT' | 'INVALID_INPUT', message: string) {
    super(message);
  }
}

const LAYER_KEY = { platform: 'platform_markup', agency: 'agency_markup', sub_agent: 'sub_agency_markup' } as const;
const LAYER_OWNER = { platform: 'platform', agency: 'agency', sub_agent: 'sub_agency' } as const;

function fmt(minor: number, currency: CurrencyCode): string {
  const exp = CURRENCIES[currency].exponent;
  return `${(minor / 10 ** exp).toFixed(exp)} ${currency}`;
}

/**
 * Final rounding (PRC-12) of the customer total.
 * - mode up/down/nearest to `incrementMinor`;
 * - charm ending (e.g. 99): the smallest amount ≥ total whose minor part ends in the charm (1,234.10 → 1,234.99).
 */
export function applyRounding(totalMinor: number, rule: RoundingRule | undefined): number {
  if (!rule || rule.mode === 'none') return totalMinor;
  if (rule.charmMinor !== null && rule.charmMinor > 0) {
    const candidate = Math.floor(totalMinor / 100) * 100 + rule.charmMinor;
    return candidate >= totalMinor ? candidate : candidate + 100;
  }
  const inc = rule.incrementMinor;
  if (rule.mode === 'up') return Math.ceil(totalMinor / inc) * inc;
  if (rule.mode === 'down') return Math.floor(totalMinor / inc) * inc;
  return Number(divRoundHalfUp(BigInt(totalMinor), BigInt(inc))) * inc;
}

/**
 * The pricing engine (PRICING_ENGINE.md). Pure and deterministic: same input → same breakdown.
 * Steps: FX → platform → agency → sub-agency markups (compounding, guardrails) → fees → discounts → tax → rounding → settlement.
 */
export function priceQuote(input: PricingInput): PriceBreakdown {
  if (input.lines.length === 0) throw new PricingError('INVALID_INPUT', 'At least one net line is required');
  const cur = input.currency;
  const warnings: string[] = [];
  const lines: BreakdownLine[] = [];
  const fxSnaps = new Map<string, FxSnapshot>();
  const platformRuns = input.ownership !== 'agency_own'; // PRC-5
  const bufferPct = platformRuns ? (input.platform.settings?.fxBufferPct ?? 0) : 0;

  // 1) FX — convert every net line to the pricing currency at the snapshot rate (FX-1).
  const net = input.lines.map((l) => {
    const raw = money(l.netUnitMinor * l.quantity, l.currency);
    if (l.currency === cur) return raw.amountMinor;
    const r = input.fx(l.currency, cur);
    if (!r) throw new PricingError('FX_UNAVAILABLE', `No ${l.currency}→${cur} rate`);
    fxSnaps.set(`${l.currency}${cur}`, { base: l.currency, quote: cur, rate: r.rate, date: r.date, bufferPct });
    return convert(raw, cur, r.rate).amountMinor;
  });
  const netTotal = net.reduce((a, b) => a + b, 0);
  lines.push({ key: 'net', owner: 'supplier', label: 'Supplier net', amountMinor: netTotal, ruleId: null, ruleVersion: null, ruleName: null, basis: input.lines.map((l) => `${l.quantity}×${fmt(l.netUnitMinor, l.currency)}`).join(' + '), clamped: false, override: null });

  const buffer = net.map((n, i) => (input.lines[i]!.currency !== cur && bufferPct > 0 ? percentOf(money(n, cur), bufferPct).amountMinor : 0));
  const bufferTotal = buffer.reduce((a, b) => a + b, 0);
  if (bufferTotal > 0) lines.push({ key: 'fx_buffer', owner: 'platform', label: 'FX buffer', amountMinor: bufferTotal, ruleId: null, ruleVersion: null, ruleName: null, basis: `${bufferPct}%`, clamped: false, override: null });

  const base = net.map((n, i) => n + buffer[i]!);

  // 2) Markup layers.
  const layers: { layer: MarkupLayer; cfg: LayerConfig; target: string | null; guard: CommercialSettingsEntity | null }[] = [];
  if (platformRuns) layers.push({ layer: 'platform', cfg: input.platform, target: input.agency.tenantId, guard: null });
  layers.push({ layer: 'agency', cfg: input.agency, target: input.subAgency?.tenantId ?? null, guard: platformRuns ? input.platform.settings : null });
  if (input.subAgency) layers.push({ layer: 'sub_agent', cfg: input.subAgency, target: null, guard: input.agency.settings });

  const markup: Record<MarkupLayer, number[]> = { platform: net.map(() => 0), agency: net.map(() => 0), sub_agent: net.map(() => 0) };
  const appliedRules: Record<MarkupLayer, ResolvedRule | null> = { platform: null, agency: null, sub_agent: null };

  for (const { layer, cfg, target, guard } of layers) {
    const ctx: MatchContext = {
      serviceType: input.serviceType, source: input.source, supplierId: input.supplierId, targetAgencyId: target,
      productId: input.productId, destinationId: input.destinationId, nationalityGroupId: input.nationalityGroupId,
      customerType: input.customerType, channel: input.channel, bookingDate: input.bookingDate, travelDate: input.travelDate,
    };
    const override = input.overrides?.find((o) => o.layer === layer) ?? null;
    const resolved = override ? null : resolveRule(input.rules, layer, cfg.tenantId, ctx);
    appliedRules[layer] = resolved;
    let mode: MarkupMode;
    let value: number;
    let fixedCurrency: CurrencyCode = cur;
    let fixedPer: 'unit' | 'booking' = 'booking';
    let basisLabel: string;
    if (override) {
      ({ mode, value } = override);
      basisLabel = 'override';
    } else if (resolved) {
      mode = resolved.rule.mode;
      value = resolved.rule.value;
      fixedCurrency = resolved.rule.fixedCurrency ?? cur;
      fixedPer = resolved.rule.fixedPer ?? 'booking';
      basisLabel = 'rule';
    } else {
      mode = 'percent';
      if (layer === 'platform') {
        const d = cfg.settings?.platformDefaults;
        value = input.ownership === 'api' ? (d?.apiPct ?? 0) : (d?.networkPct ?? 0);
      } else value = cfg.settings?.defaultMarkupPct ?? 0;
      if (!cfg.settings) warnings.push(`No commercial settings for ${layer} layer; markup 0`);
      basisLabel = 'default';
    }

    // Fixed amounts: converted at the snapshot rate, per unit (× quantity) or per booking (allocated by base).
    let raw: number[];
    if (mode === 'percent') raw = base.map((b) => percentOf(money(b, cur), value).amountMinor);
    else {
      let amount = toMinor(value, fixedCurrency);
      if (fixedCurrency !== cur) {
        const r = input.fx(fixedCurrency, cur);
        if (!r) throw new PricingError('FX_UNAVAILABLE', `No ${fixedCurrency}→${cur} rate`);
        fxSnaps.set(`${fixedCurrency}${cur}`, { base: fixedCurrency, quote: cur, rate: r.rate, date: r.date, bufferPct: 0 });
        amount = convert(money(amount, fixedCurrency), cur, r.rate).amountMinor;
      }
      raw = fixedPer === 'unit' ? input.lines.map((l) => amount * l.quantity) : allocate(money(amount, cur), base).map((m) => m.amountMinor);
    }

    // Clamp: rule per-unit min/max, then the guardrails set by the tier above (agency ← platform, sub-agency ← agency).
    let clamped = false;
    const rule = resolved?.rule;
    const g = layer === 'platform' || !guard ? null : (guard.childGuardrails[input.serviceType] ?? guard.defaultGuardrail);
    const bypass = override?.breakGuardrails === true;
    raw = raw.map((m, i) => {
      let v = m;
      const qty = input.lines[i]!.quantity;
      if (rule?.minAmountMinor !== undefined && v < rule.minAmountMinor * qty) { v = rule.minAmountMinor * qty; clamped = true; }
      if (rule?.maxAmountMinor !== undefined && v > rule.maxAmountMinor * qty) { v = rule.maxAmountMinor * qty; clamped = true; }
      if (g && !bypass) {
        const lo = percentOf(money(base[i]!, cur), g.minPct).amountMinor;
        const hi = percentOf(money(base[i]!, cur), g.maxPct).amountMinor;
        if (v < lo) { v = lo; clamped = true; }
        if (v > hi) { v = hi; clamped = true; }
      }
      return v;
    });
    if (clamped) warnings.push(`${layer} markup clamped to limits`);
    markup[layer] = raw;
    raw.forEach((m, i) => { base[i] = base[i]! + m; });
    const total = raw.reduce((a, b) => a + b, 0);
    lines.push({
      key: LAYER_KEY[layer], owner: LAYER_OWNER[layer], label: `${layer} markup`, amountMinor: total,
      ruleId: rule?.id ?? null, ruleVersion: rule?.ruleVersion ?? null, ruleName: rule?.name ?? (basisLabel === 'default' ? 'Default' : null),
      basis: mode === 'percent' ? `${value}%` : `${value} ${fixedCurrency}/${fixedPer}`, clamped,
      override: override ? { by: override.by, reason: override.reason, originalMinor: 0 } : null,
    });
  }

  const finalSeller: 'agency' | 'sub_agency' = input.subAgency ? 'sub_agency' : 'agency';
  const finalLayer: MarkupLayer = input.subAgency ? 'sub_agent' : 'agency';

  // 3) Fees of the final seller.
  const fee = net.map(() => 0);
  const taxableFee = net.map(() => 0);
  for (const f of input.feeRules) {
    if (f.status !== 'active' || (f.serviceTypes.length > 0 && !f.serviceTypes.includes(input.serviceType)) || (f.channel !== 'all' && f.channel !== input.channel)) continue;
    const amounts = f.mode === 'percent'
      ? base.map((b) => percentOf(money(b, cur), f.value).amountMinor)
      : f.per === 'unit' ? input.lines.map((l) => toMinor(f.value, cur) * l.quantity) : allocate(money(toMinor(f.value, cur), cur), base).map((m) => m.amountMinor);
    amounts.forEach((a, i) => { fee[i] = fee[i]! + a; if (f.taxable) taxableFee[i] = taxableFee[i]! + a; });
    lines.push({ key: 'fee', owner: finalSeller, label: f.name, amountMinor: amounts.reduce((a, b) => a + b, 0), ruleId: f.id, ruleVersion: null, ruleName: f.name, basis: f.mode === 'percent' ? `${f.value}%` : `${f.value} ${cur}/${f.per}`, clamped: false, override: null });
  }

  // PRC-9: final price override — the final seller's markup absorbs the difference (never below its buy price).
  if (input.finalPrice) {
    const current = base.reduce((a, b) => a + b, 0) + fee.reduce((a, b) => a + b, 0);
    let delta = input.finalPrice.preTaxMinor - current;
    const sellerMarkup = markup[finalLayer].reduce((a, b) => a + b, 0);
    if (!input.finalPrice.breakGuardrails && sellerMarkup + delta < 0) {
      warnings.push('Price override capped at the seller buy price');
      delta = -sellerMarkup;
    }
    const parts = allocate(money(delta, cur), base.map((b) => Math.max(b, 1)));
    parts.forEach((p, i) => { markup[finalLayer][i] = markup[finalLayer][i]! + p.amountMinor; base[i] = base[i]! + p.amountMinor; });
    const line = lines.find((l) => l.key === LAYER_KEY[finalLayer])!;
    line.override = { by: input.finalPrice.by, reason: input.finalPrice.reason, originalMinor: line.amountMinor };
    line.amountMinor += delta;
  }

  // 4) Discounts — funded by one party, capped so that party never sells below its buy price (PRC-11 margin floor).
  const discount = net.map(() => 0);
  const discountBy: Record<'platform' | 'agency' | 'sub_agency', number> = { platform: 0, agency: 0, sub_agency: 0 };
  for (const d of input.discounts ?? []) {
    const preTax = base.reduce((a, b) => a + b, 0) + fee.reduce((a, b) => a + b, 0) - discount.reduce((a, b) => a + b, 0);
    let amount = d.mode === 'percent' ? percentOf(money(preTax, cur), d.value).amountMinor : toMinor(d.value, cur);
    const fundingLayer: MarkupLayer = d.fundedBy === 'platform' ? 'platform' : d.fundedBy === 'agency' ? 'agency' : 'sub_agent';
    const funderMargin = markup[fundingLayer].reduce((a, b) => a + b, 0) + (d.fundedBy === finalSeller ? fee.reduce((a, b) => a + b, 0) : 0) - discountBy[d.fundedBy];
    if (amount > funderMargin) { warnings.push(`Discount ${d.label} capped at the funder's margin`); amount = Math.max(0, funderMargin); }
    discountBy[d.fundedBy] += amount;
    allocate(money(amount, cur), base.map((b, i) => b + fee[i]!)).forEach((m, i) => { discount[i] = discount[i]! + m.amountMinor; });
    lines.push({ key: 'discount', owner: d.fundedBy, label: d.label, amountMinor: -amount, ruleId: d.ref ?? null, ruleVersion: null, ruleName: d.label, basis: d.mode === 'percent' ? `${d.value}%` : `${d.value} ${cur}`, clamped: amount !== (d.mode === 'percent' ? percentOf(money(preTax, cur), d.value).amountMinor : toMinor(d.value, cur)), override: null });
  }

  // 5) Tax per line (PRC-7): profile by line, else the seller's profile for the service; inclusive or exclusive; full price or margin base.
  const profileFor = (l: NetLine) =>
    (l.taxProfileId ? input.taxProfiles.find((p) => p.id === l.taxProfileId) : undefined) ?? input.taxProfiles.find((p) => p.serviceTypes.includes(input.serviceType));
  let inclusiveTax = 0;
  const units = input.lines.map((l, i) => {
    const pre = base[i]! + fee[i]! - discount[i]!;
    const p = profileFor(l);
    let tax = 0;
    if (p && p.rateBp > 0) {
      const margin = base[i]! - net[i]! + taxableFee[i]! - discount[i]!;
      const taxBase = p.base === 'margin' ? Math.max(0, margin) : base[i]! + taxableFee[i]! - discount[i]!;
      tax = p.inclusive
        ? Number(divRoundHalfUp(BigInt(taxBase) * BigInt(p.rateBp), BigInt(10_000 + p.rateBp)))
        : Number(divRoundHalfUp(BigInt(taxBase) * BigInt(p.rateBp), 10_000n));
      if (p.inclusive) inclusiveTax += tax;
    }
    const customer = p?.inclusive ? pre : pre + tax;
    return { key: l.key, label: l.label, unitType: l.unitType, quantity: l.quantity, netMinor: net[i]!, sellMinor: customer, taxMinor: tax };
  });
  const taxTotal = units.reduce((a, u) => a + u.taxMinor, 0);
  if (taxTotal > 0) {
    const used = [...new Map(input.lines.map((l) => profileFor(l)).filter((p): p is TaxProfileEntity => Boolean(p) && p!.rateBp > 0).map((p) => [p.id, p])).values()];
    lines.push({
      key: 'tax', owner: 'tax', label: 'Tax', amountMinor: taxTotal, ruleId: null, ruleVersion: null,
      ruleName: used.map((p) => p.name).join(', '),
      basis: used.map((p) => `${p.rateBp / 100}%${p.inclusive ? ' incl.' : ''}${p.base === 'margin' ? ' on margin' : ''}`).join(', '),
      clamped: false, override: null,
    });
  }

  // 6) Final rounding by the final seller (PRC-12); the adjustment is pre-tax revenue of the final seller.
  const sellerSettings = input.subAgency?.settings ?? input.agency.settings;
  const beforeRounding = units.reduce((a, u) => a + u.sellMinor, 0);
  const customerTotal = applyRounding(beforeRounding, sellerSettings?.rounding[cur]);
  const roundingAdj = customerTotal - beforeRounding;
  if (roundingAdj !== 0) lines.push({ key: 'rounding', owner: finalSeller, label: 'Rounding', amountMinor: roundingAdj, ruleId: null, ruleVersion: null, ruleName: null, basis: `${sellerSettings?.rounding[cur]?.mode} ${fmt(sellerSettings?.rounding[cur]?.incrementMinor ?? 0, cur)}`, clamped: false, override: null });

  // 7) Commission & settlement (PRICING_ENGINE §5): commission reduces the supplier payout, never the customer price.
  const commission = input.commission.beneficiary === 'none' ? 0 : percentOf(money(netTotal, cur), input.commission.pct).amountMinor;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const feeTotal = sum(fee);
  const platformRevenue = sum(markup.platform) + bufferTotal + (input.commission.beneficiary === 'platform' ? commission : 0) - discountBy.platform;
  let agencyRevenue = sum(markup.agency) + (input.commission.beneficiary === 'agency' ? commission : 0) - discountBy.agency;
  let subAgencyRevenue = input.subAgency ? sum(markup.sub_agent) - discountBy.sub_agency : 0;
  // Fees, rounding and any tax carved out of inclusive prices belong to the final seller.
  if (finalSeller === 'agency') agencyRevenue += feeTotal + roundingAdj - inclusiveTax;
  else subAgencyRevenue += feeTotal + roundingAdj - inclusiveTax;

  const settlement = {
    supplierPayoutMinor: netTotal - commission,
    commissionMinor: commission,
    commissionBeneficiary: input.commission.beneficiary,
    platformRevenueMinor: platformRevenue,
    agencyRevenueMinor: agencyRevenue,
    subAgencyRevenueMinor: subAgencyRevenue,
    taxPayableMinor: taxTotal,
  };
  // Waterfall invariant: customer total = supplier payout + every party's revenue + tax
  // (commission is already inside its beneficiary's revenue; inclusive tax is carved out of the final seller's).
  const parts = settlement.supplierPayoutMinor + platformRevenue + agencyRevenue + subAgencyRevenue + taxTotal;
  if (parts !== customerTotal) throw new PricingError('INVARIANT', `Settlement ${parts} ≠ customer total ${customerTotal}`);

  const agencyBuy = netTotal + bufferTotal + sum(markup.platform);
  const preTax = customerTotal - taxTotal;
  const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 10_000) / 100);
  return {
    engineVersion: ENGINE_VERSION,
    computedAt: input.now,
    currency: cur,
    fx: [...fxSnaps.values()],
    lines,
    units,
    totals: { netMinor: netTotal, preTaxMinor: preTax, taxMinor: taxTotal, customerTotalMinor: customerTotal },
    settlement,
    buyPrices: { agencyBuyMinor: agencyBuy, subAgencyBuyMinor: input.subAgency ? agencyBuy + sum(markup.agency) : null },
    margins: {
      platformPct: pct(platformRevenue, preTax),
      agencyPct: pct(agencyRevenue, preTax),
      subAgencyPct: input.subAgency ? pct(subAgencyRevenue, preTax) : null,
      grossProfitMinor: preTax - settlement.supplierPayoutMinor,
    },
    context: { serviceType: input.serviceType, source: input.source, ownership: input.ownership, channel: input.channel, customerType: input.customerType, finalSeller },
    warnings,
  };
}

export type { ResolvedRule };
