import type { CommercialSettingsEntity, MarkupRuleEntity, NetLine, TaxProfileEntity } from '@travelta/schemas';
import { createRng } from '@travelta/shared';
import { describe, expect, it } from 'vitest';
import { applyRounding, priceQuote, type PricingInput } from './engine';
import { resolveRule, specificity, type MatchContext } from './resolve';

const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', version: 1 };
const settings = (tenantId: string, patch: Partial<CommercialSettingsEntity> = {}): CommercialSettingsEntity => ({
  id: `cs_${tenantId}`, ...STAMP, tenantId, defaultMarkupPct: 0, platformDefaults: null, childGuardrails: {}, defaultGuardrail: { minPct: 0, maxPct: 1000 },
  fxBufferPct: 0, rounding: {}, maxDiscountPctByRole: {}, defaultCreditLimitMinor: null, payLaterEnabled: false, cancellationAdminFeeMinor: 0, isDemoValue: true, ...patch,
});
let n = 0;
const rule = (tenantId: string, layer: MarkupRuleEntity['layer'], patch: Partial<MarkupRuleEntity>): MarkupRuleEntity => ({
  id: `r${++n}`, ...STAMP, tenantId, ruleVersion: 1, layer, name: `rule ${n}`, status: 'active', match: {}, mode: 'percent', value: 0, priority: 0, isDemoValue: true, ...patch,
});
const tax = (rateBp: number, patch: Partial<TaxProfileEntity> = {}): TaxProfileEntity => ({
  id: `tax${rateBp}`, ...STAMP, tenantId: 'agency', name: `VAT ${rateBp / 100}%`, serviceTypes: ['hotel', 'tour', 'flight', 'visa', 'umrah', 'activity', 'transfer'], rateBp, inclusive: false, base: 'full_price', isDemoValue: true, ...patch,
});
const line = (netUnitMinor: number, quantity = 1, currency: NetLine['currency'] = 'USD', key = 'l1'): NetLine => ({
  key, label: { en: key, ar: key }, unitType: 'room_night', quantity, netUnitMinor, currency,
});

function input(patch: Partial<PricingInput> = {}): PricingInput {
  return {
    serviceType: 'hotel', source: 'tbo', ownership: 'api', supplierId: 'sup1', productId: 'h1', destinationId: 'cai', nationalityGroupId: null,
    customerType: 'individual', channel: 'b2c', bookingDate: '2026-11-15', travelDate: '2026-12-20', currency: 'USD',
    lines: [line(100_000)], platform: { tenantId: 'platform', settings: settings('platform') }, agency: { tenantId: 'agency', settings: settings('agency') },
    subAgency: null, rules: [], taxProfiles: [], feeRules: [], commission: { pct: 0, beneficiary: 'none' },
    fx: (from, to) => (from === 'USD' && to === 'EGP' ? { rate: 48.5, date: '2026-11-15' } : from === 'EGP' && to === 'USD' ? { rate: 1 / 48.5, date: '2026-11-15' } : null),
    now: '2026-11-15T09:00:00.000Z',
    ...patch,
  };
}
const lineOf = (b: ReturnType<typeof priceQuote>, key: string) => b.lines.find((l) => l.key === key)?.amountMinor ?? 0;
const parts = (b: ReturnType<typeof priceQuote>) => b.settlement.supplierPayoutMinor + b.settlement.platformRevenueMinor + b.settlement.agencyRevenueMinor + b.settlement.subAgencyRevenueMinor + b.settlement.taxPayableMinor;

describe('golden vectors (PRICING_ENGINE §3, TESTING_STRATEGY §2)', () => {
  it('PRC-G1: 1,000 USD → platform 8% → agency 10% → sub-agency 20 fixed → 14% tax = 1,377.12 USD', () => {
    const b = priceQuote(input({
      subAgency: { tenantId: 'sub', settings: settings('sub') },
      rules: [rule('platform', 'platform', { value: 8 }), rule('agency', 'agency', { value: 10 }), rule('sub', 'sub_agent', { mode: 'fixed', value: 20, fixedCurrency: 'USD', fixedPer: 'booking' })],
      taxProfiles: [tax(1400)],
    }));
    expect(lineOf(b, 'platform_markup')).toBe(8_000);
    expect(lineOf(b, 'agency_markup')).toBe(10_800);
    expect(lineOf(b, 'sub_agency_markup')).toBe(2_000);
    expect(b.totals).toEqual({ netMinor: 100_000, preTaxMinor: 120_800, taxMinor: 16_912, customerTotalMinor: 137_712 });
    expect(b.buyPrices).toEqual({ agencyBuyMinor: 108_000, subAgencyBuyMinor: 118_800 });
    expect(parts(b)).toBe(b.totals.customerTotalMinor);
  });

  it('commission settlement: network net 1,000 EGP, commission 10%, platform 5%, agency 12% → 1,176; payout 900; platform 150; agency 126', () => {
    const b = priceQuote(input({
      ownership: 'network', source: 'extranet', currency: 'EGP', lines: [line(100_000, 1, 'EGP')],
      rules: [rule('platform', 'platform', { value: 5 }), rule('agency', 'agency', { value: 12 })],
      commission: { pct: 10, beneficiary: 'platform' },
    }));
    expect(b.totals.customerTotalMinor).toBe(117_600);
    expect(b.settlement).toMatchObject({ supplierPayoutMinor: 90_000, commissionMinor: 10_000, platformRevenueMinor: 15_000, agencyRevenueMinor: 12_600 });
    expect(parts(b)).toBe(117_600);
  });

  it('v1 tax example (PRC-7): 2×110 EGP @5% + 5×125 EGP @0% = 856 EGP on agency-own stock', () => {
    const b = priceQuote(input({
      ownership: 'agency_own', source: 'manual', currency: 'EGP',
      lines: [{ ...line(11_000, 2, 'EGP', 'deluxe'), taxProfileId: 'tax500' }, { ...line(12_500, 5, 'EGP', 'standard'), taxProfileId: 'tax0' }],
      taxProfiles: [tax(500), { ...tax(0), id: 'tax0' }],
    }));
    expect(b.units.map((u) => u.sellMinor)).toEqual([23_100, 62_500]);
    expect(b.totals.customerTotalMinor).toBe(85_600);
  });
});

describe('layers', () => {
  it('skips the platform layer for an agency’s own inventory (PRC-5)', () => {
    const b = priceQuote(input({ ownership: 'agency_own', source: 'manual', rules: [rule('platform', 'platform', { value: 50 }), rule('agency', 'agency', { value: 10 })] }));
    expect(b.lines.some((l) => l.key === 'platform_markup')).toBe(false);
    expect(b.totals.customerTotalMinor).toBe(110_000);
    expect(b.buyPrices.agencyBuyMinor).toBe(100_000);
  });

  it('falls back to layer defaults from commercial settings when no rule matches', () => {
    const b = priceQuote(input({
      platform: { tenantId: 'platform', settings: settings('platform', { platformDefaults: { apiPct: 8, networkPct: 5 } }) },
      agency: { tenantId: 'agency', settings: settings('agency', { defaultMarkupPct: 12 }) },
    }));
    expect(lineOf(b, 'platform_markup')).toBe(8_000);
    expect(lineOf(b, 'agency_markup')).toBe(12_960);
    expect(b.lines.find((l) => l.key === 'agency_markup')?.ruleName).toBe('Default');
  });

  it('converts fixed markups in a foreign currency and per unit', () => {
    const b = priceQuote(input({
      currency: 'EGP', lines: [line(10_000, 3, 'USD')], ownership: 'agency_own',
      rules: [rule('agency', 'agency', { mode: 'fixed', value: 2, fixedCurrency: 'USD', fixedPer: 'unit' })],
    }));
    // 3 × 100 USD = 300 USD → 14,550 EGP; 2 USD × 3 units = 6 USD → 291 EGP.
    expect(lineOf(b, 'net')).toBe(1_455_000);
    expect(lineOf(b, 'agency_markup')).toBe(29_100);
    expect(b.fx.map((f) => `${f.base}${f.quote}`)).toEqual(['USDEGP']);
  });

  it('adds the FX buffer as platform revenue only on platform-marked stock', () => {
    const b = priceQuote(input({ currency: 'EGP', platform: { tenantId: 'platform', settings: settings('platform', { fxBufferPct: 1 }) } }));
    expect(lineOf(b, 'fx_buffer')).toBe(48_500);
    expect(b.settlement.platformRevenueMinor).toBe(48_500);
    expect(parts(b)).toBe(b.totals.customerTotalMinor);
  });
});

describe('rule resolution (PRC-4)', () => {
  const ctx: MatchContext = {
    serviceType: 'hotel', source: 'tbo', supplierId: 'sup1', targetAgencyId: 'agency', productId: 'h1', destinationId: 'cai',
    nationalityGroupId: 'gcc', customerType: 'vip', channel: 'b2c', bookingDate: '2026-11-15', travelDate: '2026-12-20',
  };
  it('prefers product > supplier > target agency > destination > nationality > customer type > default', () => {
    const rules = [
      rule('platform', 'platform', { name: 'default', value: 1 }),
      rule('platform', 'platform', { name: 'customer', value: 2, match: { customerTypes: ['vip'] } }),
      rule('platform', 'platform', { name: 'nationality', value: 3, match: { nationalityGroupIds: ['gcc'] } }),
      rule('platform', 'platform', { name: 'destination', value: 4, match: { destinationIds: ['cai'] } }),
      rule('platform', 'platform', { name: 'agency', value: 5, match: { targetAgencyIds: ['agency'] } }),
      rule('platform', 'platform', { name: 'supplier', value: 6, match: { supplierIds: ['sup1'] } }),
      rule('platform', 'platform', { name: 'product', value: 7, match: { productIds: ['h1'] } }),
    ];
    const order: string[] = [];
    let pool = [...rules];
    while (pool.length) {
      const r = resolveRule(pool, 'platform', 'platform', ctx)!;
      order.push(r.rule.name);
      pool = pool.filter((x) => x.id !== r.rule.id);
    }
    expect(order).toEqual(['product', 'supplier', 'agency', 'destination', 'nationality', 'customer', 'default']);
    expect(specificity(rules[6]!)).toBeGreaterThan(specificity(rules[5]!));
  });

  it('breaks ties by priority, ignores inactive, out-of-window and non-matching rules, and other tenants’ rules', () => {
    const rules = [
      rule('platform', 'platform', { name: 'low', priority: 1, match: { serviceTypes: ['hotel'] } }),
      rule('platform', 'platform', { name: 'high', priority: 9, match: { serviceTypes: ['hotel'] } }),
      rule('platform', 'platform', { name: 'inactive', status: 'inactive', match: { productIds: ['h1'] } }),
      rule('platform', 'platform', { name: 'expired', match: { productIds: ['h1'], bookingWindow: { to: '2026-01-01' } } }),
      rule('platform', 'platform', { name: 'flights', match: { productIds: ['h1'], serviceTypes: ['flight'] } }),
      rule('other', 'platform', { name: 'other tenant', match: { productIds: ['h1'] } }),
    ];
    expect(resolveRule(rules, 'platform', 'platform', ctx)?.rule.name).toBe('high');
  });
});

describe('limits, overrides, discounts', () => {
  it('clamps agency markup to the platform guardrails and rule min/max (PRC-11)', () => {
    const b = priceQuote(input({
      ownership: 'agency_own', source: 'manual',
      platform: { tenantId: 'platform', settings: settings('platform', { childGuardrails: { hotel: { minPct: 0, maxPct: 40 } } }) },
      rules: [rule('agency', 'agency', { value: 60 })],
    }));
    // Guardrails only apply when the platform layer runs (platform stock); for agency-own stock they don't.
    expect(lineOf(b, 'agency_markup')).toBe(60_000);
    const g = priceQuote(input({
      platform: { tenantId: 'platform', settings: settings('platform', { childGuardrails: { hotel: { minPct: 0, maxPct: 40 } } }) },
      rules: [rule('agency', 'agency', { value: 60 })],
    }));
    expect(lineOf(g, 'agency_markup')).toBe(40_000);
    expect(g.lines.find((l) => l.key === 'agency_markup')?.clamped).toBe(true);
    const r = priceQuote(input({ ownership: 'agency_own', source: 'manual', rules: [rule('agency', 'agency', { value: 1, minAmountMinor: 5_000 })] }));
    expect(lineOf(r, 'agency_markup')).toBe(5_000);
  });

  it('overrides a layer (audited) and only breaks guardrails when allowed', () => {
    const base = input({ platform: { tenantId: 'platform', settings: settings('platform', { defaultGuardrail: { minPct: 0, maxPct: 20 } }) } });
    const capped = priceQuote({ ...base, overrides: [{ layer: 'agency', mode: 'percent', value: 50, by: 'u1', reason: 'VIP' }] });
    expect(lineOf(capped, 'agency_markup')).toBe(20_000);
    const broken = priceQuote({ ...base, overrides: [{ layer: 'agency', mode: 'percent', value: 50, by: 'u1', reason: 'VIP', breakGuardrails: true }] });
    expect(lineOf(broken, 'agency_markup')).toBe(50_000);
    expect(broken.lines.find((l) => l.key === 'agency_markup')?.override).toMatchObject({ by: 'u1', reason: 'VIP' });
  });

  it('final price override is absorbed by the seller and floored at its buy price', () => {
    const b = priceQuote(input({ ownership: 'agency_own', source: 'manual', rules: [rule('agency', 'agency', { value: 10 })], finalPrice: { preTaxMinor: 105_000, by: 'u1', reason: 'match competitor' } }));
    expect(b.totals.customerTotalMinor).toBe(105_000);
    expect(lineOf(b, 'agency_markup')).toBe(5_000);
    const floor = priceQuote(input({ ownership: 'agency_own', source: 'manual', rules: [rule('agency', 'agency', { value: 10 })], finalPrice: { preTaxMinor: 90_000, by: 'u1', reason: 'x' } }));
    expect(floor.totals.customerTotalMinor).toBe(100_000);
    expect(floor.warnings.join()).toMatch(/capped/);
  });

  it('caps discounts at the funding party’s margin (never below buy price) and recomputes tax after discount', () => {
    const b = priceQuote(input({
      ownership: 'agency_own', source: 'manual', rules: [rule('agency', 'agency', { value: 10 })], taxProfiles: [tax(1400)],
      discounts: [{ label: 'SUMMER', mode: 'percent', value: 50, fundedBy: 'agency' }],
    }));
    expect(lineOf(b, 'discount')).toBe(-10_000);
    expect(b.totals.preTaxMinor).toBe(100_000);
    expect(b.totals.taxMinor).toBe(14_000);
    expect(b.settlement.agencyRevenueMinor).toBe(0);
  });
});

describe('tax and rounding', () => {
  it('backs tax out of inclusive prices and charges tax on margin when configured', () => {
    const incl = priceQuote(input({ ownership: 'agency_own', source: 'manual', rules: [rule('agency', 'agency', { value: 14 })], taxProfiles: [tax(1400, { inclusive: true })] }));
    expect(incl.totals.customerTotalMinor).toBe(114_000);
    expect(incl.totals.taxMinor).toBe(14_000);
    expect(incl.settlement.agencyRevenueMinor).toBe(0);
    expect(parts(incl)).toBe(114_000);
    const margin = priceQuote(input({ ownership: 'agency_own', source: 'manual', rules: [rule('agency', 'agency', { value: 10 })], taxProfiles: [tax(1400, { base: 'margin' })] }));
    expect(margin.totals.taxMinor).toBe(1_400);
  });

  it('rounds the customer total and credits the difference to the final seller', () => {
    expect(applyRounding(123_410, { mode: 'up', incrementMinor: 100, charmMinor: null })).toBe(123_500);
    expect(applyRounding(123_410, { mode: 'nearest', incrementMinor: 500, charmMinor: null })).toBe(123_500);
    expect(applyRounding(123_410, { mode: 'down', incrementMinor: 100, charmMinor: null })).toBe(123_400);
    expect(applyRounding(123_410, { mode: 'up', incrementMinor: 100, charmMinor: 99 })).toBe(123_499);
    expect(applyRounding(123_499, { mode: 'up', incrementMinor: 100, charmMinor: 99 })).toBe(123_499);
    const b = priceQuote(input({ ownership: 'agency_own', source: 'manual', rules: [rule('agency', 'agency', { value: 3.33 })], agency: { tenantId: 'agency', settings: settings('agency', { rounding: { USD: { mode: 'up', incrementMinor: 100, charmMinor: null } } }) } }));
    expect(b.totals.customerTotalMinor % 100).toBe(0);
    expect(lineOf(b, 'rounding')).toBeGreaterThan(0);
    expect(parts(b)).toBe(b.totals.customerTotalMinor);
  });
});

describe('property: the settlement waterfall always equals the customer total', () => {
  it('holds for 500 random quotes across ownerships, currencies, layers, taxes, fees, discounts and rounding', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const ownership = rng.pick(['api', 'network', 'agency_own'] as const);
      const withSub = rng.chance(0.4);
      const currency = rng.pick(['USD', 'EGP'] as const);
      const lines = Array.from({ length: rng.int(1, 3) }, (_, k) => line(rng.int(1, 500_000), rng.int(1, 5), rng.pick(['USD', 'EGP'] as const), `l${k}`));
      const b = priceQuote(input({
        ownership, source: ownership === 'api' ? 'tbo' : ownership === 'network' ? 'extranet' : 'manual', currency, lines,
        subAgency: withSub ? { tenantId: 'sub', settings: settings('sub', { rounding: rng.chance(0.5) ? { [currency]: { mode: rng.pick(['up', 'nearest', 'down'] as const), incrementMinor: rng.pick([1, 100, 500]), charmMinor: rng.chance(0.3) ? 99 : null } } : {} }) } : null,
        platform: { tenantId: 'platform', settings: settings('platform', { fxBufferPct: rng.pick([0, 0.5, 1]), platformDefaults: { apiPct: 8, networkPct: 5 }, defaultGuardrail: { minPct: 0, maxPct: rng.pick([15, 40, 1000]) } }) },
        agency: { tenantId: 'agency', settings: settings('agency', { defaultMarkupPct: rng.int(0, 30), rounding: rng.chance(0.5) ? { [currency]: { mode: 'nearest', incrementMinor: 100, charmMinor: null } } : {} }) },
        rules: rng.chance(0.5) ? [rule('agency', 'agency', { mode: 'fixed', value: rng.int(1, 50), fixedCurrency: rng.pick(['USD', 'EGP'] as const), fixedPer: rng.pick(['unit', 'booking'] as const) })] : [],
        taxProfiles: rng.chance(0.7) ? [tax(rng.pick([0, 500, 1400]), { inclusive: rng.chance(0.3), base: rng.chance(0.2) ? 'margin' : 'full_price' })] : [],
        feeRules: rng.chance(0.4) ? [{ id: 'f', ...STAMP, tenantId: 'agency', name: 'Service fee', serviceTypes: [], channel: 'all', mode: rng.pick(['percent', 'fixed'] as const), value: rng.int(1, 20), per: rng.pick(['unit', 'booking'] as const), taxable: rng.chance(0.5), status: 'active', isDemoValue: true }] : [],
        discounts: rng.chance(0.4) ? [{ label: 'PROMO', mode: rng.pick(['percent', 'fixed'] as const), value: rng.int(1, 40), fundedBy: withSub && rng.chance(0.5) ? 'sub_agency' : 'agency' }] : [],
        commission: ownership === 'api' ? { pct: 0, beneficiary: 'none' } : { pct: rng.int(0, 15), beneficiary: ownership === 'network' ? 'platform' : 'agency' },
      }));
      expect(parts(b), `case ${i}`).toBe(b.totals.customerTotalMinor);
      expect(b.totals.preTaxMinor + b.totals.taxMinor).toBe(b.totals.customerTotalMinor);
      expect(b.settlement.supplierPayoutMinor + b.settlement.commissionMinor).toBe(b.totals.netMinor);
    }
  });
});
