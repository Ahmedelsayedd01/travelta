import type { CurrencyCode, InventorySource, MarkupLayer, ServiceType, SupplierOwnership } from '@travelta/contracts';
import { priceQuote, resolveRule, type DiscountInput, type LayerOverride, type MatchContext, type PricingInput } from '@travelta/domain';
import type { CustomerType, NetLine, OrganizationEntity, PriceBreakdown, SimulateOutput } from '@travelta/schemas';
import { allocate, money } from '@travelta/shared';
import type { DemoClock } from '../clock';
import type { Database } from '../db/database';
import { ApiException } from '../errors';
import { rateOn } from './fx';

export interface QuoteRequest {
  serviceType: ServiceType;
  source: InventorySource;
  ownership: SupplierOwnership;
  supplierId: string;
  productId?: string | null;
  destinationId?: string | null;
  nationalityGroupId?: string | null;
  customerType: CustomerType;
  channel: 'b2b' | 'b2c';
  lines: NetLine[];
  currency: CurrencyCode;
  travelDate: string;
  /** The organization selling: an agency, a sub-agency, or the platform retail org (Travelta Direct). */
  sellerOrgId: string;
  promoCode?: string;
  overrides?: LayerOverride[];
  finalPrice?: PricingInput['finalPrice'];
}

export interface QuoteResult {
  breakdown: PriceBreakdown;
  resolution: SimulateOutput['resolution'];
  /** The promo code applied (if any), so checkout can count its use. */
  promoCodeId: string | null;
}

const platformOrg = (db: Database) => {
  const p = db.find('organizations', (o) => o.type === 'platform');
  if (!p) throw new ApiException('INTERNAL', 'Platform organization missing');
  return p;
};
const settingsOf = (db: Database, tenantId: string) => db.find('commercialSettings', (s) => s.tenantId === tenantId) ?? null;

/** Commission terms from the active supplier contract (PRICING_ENGINE §5). API stock is net-rated: no commission. */
function commissionFor(db: Database, today: string, req: QuoteRequest, agencyId: string): PricingInput['commission'] {
  if (req.ownership === 'api') return { pct: 0, beneficiary: 'none' };
  const owner = req.ownership === 'network' ? platformOrg(db).id : agencyId;
  const kind = req.ownership === 'network' ? 'network' : 'own';
  const c = db.find('supplierContracts', (x) => x.tenantId === owner && x.supplier.kind === kind && x.supplier.id === req.supplierId && x.status === 'active' && x.validFrom <= today && x.validTo >= today);
  if (!c) return { pct: 0, beneficiary: 'none' };
  return { pct: c.commissionByService[req.serviceType] ?? c.commissionPct, beneficiary: req.ownership === 'network' ? 'platform' : 'agency' };
}

/** Resolve the layer organizations for a seller: sub-agencies sell at their parent's B2B price (PRC-6). */
export function sellerChain(db: Database, sellerOrgId: string): { agency: OrganizationEntity; subAgency: OrganizationEntity | null } {
  const seller = db.get('organizations', sellerOrgId);
  if (!seller || seller.type !== 'agency') throw new ApiException('VALIDATION_ERROR', 'Seller must be an agency', [{ field: 'sellerOrgId', issue: 'validation.invalid_value' }]);
  if (seller.parentId) {
    const parent = db.get('organizations', seller.parentId);
    if (!parent) throw new ApiException('INTERNAL', 'Parent agency missing');
    return { agency: parent, subAgency: seller };
  }
  return { agency: seller, subAgency: null };
}

/**
 * The single entry point for pricing anything (search results, cart quotes, checkout, simulator).
 * Builds the engine input from the database — rules, commercial settings, tax profiles, fees, contract commission,
 * FX at the demo clock's date — and runs the pure engine from @travelta/domain.
 * SIMULATION ONLY: production runs the same code server-side; client-supplied prices are never trusted.
 */
export function quote(db: Database, clock: DemoClock, req: QuoteRequest): QuoteResult {
  const today = clock.today();
  const platform = platformOrg(db);
  const { agency, subAgency } = sellerChain(db, req.sellerOrgId);
  const finalSeller = subAgency ?? agency;
  const rules = db.filter('markupRules', (r) => r.status === 'active');

  // Promo codes belong to the final seller and are funded by it (PRC-11).
  let promoCodeId: string | null = null;
  const discounts: DiscountInput[] = [];
  if (req.promoCode) {
    const code = req.promoCode.trim().toUpperCase();
    const promo = db.find('promoCodes', (p) => p.tenantId === finalSeller.id && p.code === code);
    const usable = promo && promo.status === 'active' && promo.validFrom <= today && promo.validTo >= today
      && (promo.maxUses === null || promo.uses < promo.maxUses) && (promo.serviceTypes.length === 0 || promo.serviceTypes.includes(req.serviceType));
    if (!usable) throw new ApiException('VALIDATION_ERROR', 'Promo code is not valid for this booking', [{ field: 'promoCode', issue: 'validation.promo_invalid' }]);
    promoCodeId = promo.id;
    discounts.push({ label: promo.code, mode: promo.mode, value: promo.value, fundedBy: subAgency ? 'sub_agency' : 'agency', ref: promo.id });
  }

  const input: PricingInput = {
    serviceType: req.serviceType, source: req.source, ownership: req.ownership, supplierId: req.supplierId,
    productId: req.productId ?? null, destinationId: req.destinationId ?? null, nationalityGroupId: req.nationalityGroupId ?? null,
    customerType: req.customerType, channel: req.channel, bookingDate: today, travelDate: req.travelDate, currency: req.currency, lines: req.lines,
    platform: { tenantId: platform.id, settings: settingsOf(db, platform.id) },
    agency: { tenantId: agency.id, settings: settingsOf(db, agency.id) },
    subAgency: subAgency ? { tenantId: subAgency.id, settings: settingsOf(db, subAgency.id) } : null,
    rules,
    taxProfiles: db.filter('taxProfiles', (t) => t.tenantId === finalSeller.id),
    feeRules: db.filter('feeRules', (f) => f.tenantId === finalSeller.id),
    commission: commissionFor(db, today, req, agency.id),
    fx: (from, to) => rateOn(db, from, to, today),
    discounts,
    overrides: req.overrides,
    finalPrice: req.finalPrice,
    now: clock.nowIso(),
  };
  let breakdown: PriceBreakdown;
  try {
    breakdown = priceQuote(input);
  } catch (error) {
    throw new ApiException('INTERNAL', error instanceof Error ? error.message : 'Pricing failed');
  }

  // Explain which rule won per layer (pricing simulator).
  const layers: { layer: MarkupLayer; owner: string; target: string | null; runs: boolean }[] = [
    { layer: 'platform', owner: platform.id, target: agency.id, runs: req.ownership !== 'agency_own' },
    { layer: 'agency', owner: agency.id, target: subAgency?.id ?? null, runs: true },
    { layer: 'sub_agent', owner: subAgency?.id ?? '', target: null, runs: subAgency !== null },
  ];
  const resolution = layers.filter((l) => l.layer !== 'sub_agent' || l.runs).map((l) => {
    if (!l.runs) return { layer: l.layer, ruleId: null, ruleName: null, score: null, source: 'skipped' as const, alsoMatched: [] };
    const ctx: MatchContext = {
      serviceType: req.serviceType, source: req.source, supplierId: req.supplierId, targetAgencyId: l.target, productId: req.productId ?? null,
      destinationId: req.destinationId ?? null, nationalityGroupId: req.nationalityGroupId ?? null, customerType: req.customerType,
      channel: req.channel, bookingDate: today, travelDate: req.travelDate,
    };
    const r = resolveRule(rules, l.layer, l.owner, ctx);
    return r
      ? { layer: l.layer, ruleId: r.rule.id, ruleName: r.rule.name, score: r.score, source: 'rule' as const, alsoMatched: r.alsoMatched }
      : { layer: l.layer, ruleId: null, ruleName: null, score: null, source: 'default' as const, alsoMatched: [] };
  });
  return { breakdown, resolution, promoCodeId };
}

export type Audience = 'platform' | 'agency' | 'sub_agency' | 'customer' | 'supplier';

/**
 * Field-level redaction (TENANCY_AND_SECURITY §4) — applied on the "server" before any response leaves.
 *  - platform: everything
 *  - agency: sees its cost as ONE figure (supplier net + FX buffer + platform markup → `buy_price`), never the split
 *  - sub-agency: sees its buy price (agency B2B price) and its own markup only
 *  - customer: final price and tax only
 */
export function projectBreakdown(b: PriceBreakdown, audience: Audience): PriceBreakdown {
  if (audience === 'platform') return b;
  const hidden = new Set<string>(audience === 'agency' ? ['net', 'fx_buffer', 'platform_markup'] : ['net', 'fx_buffer', 'platform_markup', 'agency_markup']);
  if (audience === 'agency' && b.context.ownership === 'agency_own') hidden.clear(); // their own supplier: nothing above them to hide
  const buy = audience === 'agency' ? b.buyPrices.agencyBuyMinor : (b.buyPrices.subAgencyBuyMinor ?? b.buyPrices.agencyBuyMinor);
  if (hidden.size === 0) return b;
  const visible = b.lines.filter((l) => !hidden.has(l.key));
  const unitBuy = allocate(money(buy, b.currency), b.units.map((u) => Math.max(u.netMinor, 1)));
  const redacted: PriceBreakdown = {
    ...b,
    lines: [{ key: 'buy_price', owner: audience === 'agency' ? 'platform' : 'agency', label: 'Buy price', amountMinor: buy, ruleId: null, ruleVersion: null, ruleName: null, basis: '', clamped: false, override: null }, ...visible],
    units: b.units.map((u, i) => ({ ...u, netMinor: unitBuy[i]!.amountMinor })),
    totals: { ...b.totals, netMinor: buy },
    settlement: {
      ...b.settlement,
      supplierPayoutMinor: buy, commissionMinor: 0, commissionBeneficiary: 'none', platformRevenueMinor: 0,
      agencyRevenueMinor: audience === 'agency' ? b.settlement.agencyRevenueMinor : 0,
    },
    buyPrices: { agencyBuyMinor: audience === 'agency' ? buy : 0, subAgencyBuyMinor: audience === 'sub_agency' ? buy : null },
    margins: {
      platformPct: 0, agencyPct: audience === 'agency' ? b.margins.agencyPct : 0, subAgencyPct: audience === 'sub_agency' ? b.margins.subAgencyPct : null,
      grossProfitMinor: b.totals.preTaxMinor - buy,
    },
  };
  if (audience !== 'customer' && audience !== 'supplier') return redacted;
  // Customers and suppliers never see margins or buy prices.
  return {
    ...redacted,
    lines: b.lines.filter((l) => l.key === 'tax' || l.key === 'discount' || l.key === 'fee'),
    units: b.units.map((u) => ({ ...u, netMinor: 0 })),
    totals: { ...b.totals, netMinor: 0 },
    settlement: { supplierPayoutMinor: 0, commissionMinor: 0, commissionBeneficiary: 'none', platformRevenueMinor: 0, agencyRevenueMinor: 0, subAgencyRevenueMinor: 0, taxPayableMinor: b.totals.taxMinor },
    buyPrices: { agencyBuyMinor: 0, subAgencyBuyMinor: null },
    margins: { platformPct: 0, agencyPct: 0, subAgencyPct: null, grossProfitMinor: 0 },
  };
}

/** Which audience the caller is for pricing data. */
export function audienceOf(org: OrganizationEntity | undefined, userType: 'staff' | 'customer'): Audience {
  if (userType === 'customer') return 'customer';
  if (!org) return 'customer';
  if (org.type === 'platform') return 'platform';
  if (org.type === 'supplier') return 'supplier';
  return org.parentId ? 'sub_agency' : 'agency';
}
