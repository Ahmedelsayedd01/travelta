import type { CalendarOverrideEntity, RateUnit } from '@travelta/schemas';
import { describe, expect, it } from 'vitest';
import { cancellationFee, checkDate, checkStay, netOn, overridesIndex } from './availability';

const unit: RateUnit = {
  id: 'u1', name: { en: 'Deluxe', ar: 'ديلوكس' }, baseNetMinor: 100_000, childNetMinor: null, weekendUpliftPct: 20, defaultAllotment: 5, minStay: 2,
  policy: { nonRefundable: false, rules: [{ daysBefore: 14, feeType: 'percent', value: 0 }, { daysBefore: 7, feeType: 'percent', value: 50 }, { daysBefore: 0, feeType: 'percent', value: 100 }] },
  mealPlan: 'BB', maxAdults: 2, maxChildren: 1, times: [], weekdays: [],
};
const product = { seasons: [{ from: '2026-12-20', to: '2027-01-05', upliftPct: 50, name: 'Holidays' }] };
const ov = (date: string, patch: Partial<CalendarOverrideEntity>): CalendarOverrideEntity => ({
  id: `o${date}`, createdAt: '', updatedAt: '', version: 1, productId: 'p', unitId: 'u1', date, allotment: null, sold: 0, stopSell: false, netMinor: null, ...patch,
});

describe('nightly net (INVT-1)', () => {
  it('applies the weekend uplift (Fri/Sat) and season uplift, and lets overrides win', () => {
    expect(netOn(product, unit, '2026-11-16')).toBe(100_000); // Monday
    expect(netOn(product, unit, '2026-11-20')).toBe(120_000); // Friday
    expect(netOn(product, unit, '2026-12-22')).toBe(150_000); // Tuesday in season
    expect(netOn(product, unit, '2026-12-25')).toBe(180_000); // Friday in season: 1.2 × 1.5
    expect(netOn(product, unit, '2026-11-16', { netMinor: 77_700 })).toBe(77_700);
  });
});

describe('stay availability (INVT-2)', () => {
  it('needs every night free, respects min stay and stop-sell, and sums per-night nets', () => {
    const none = overridesIndex([]);
    const ok = checkStay(product, unit, '2026-11-18', '2026-11-21', 2, none);
    expect(ok).toMatchObject({ ok: true, totalNetMinor: 100_000 + 100_000 + 120_000 });
    expect(checkStay(product, unit, '2026-11-18', '2026-11-19', 1, none)).toMatchObject({ ok: false, reason: 'min_stay', minStay: 2 });
    const busy = overridesIndex([ov('2026-11-19', { sold: 4 }), ov('2026-11-20', { stopSell: true })]);
    expect(checkStay(product, unit, '2026-11-18', '2026-11-20', 2, busy)).toMatchObject({ ok: false, reason: 'sold_out', date: '2026-11-19' });
    expect(checkStay(product, unit, '2026-11-20', '2026-11-22', 1, busy)).toMatchObject({ ok: false, reason: 'sold_out', date: '2026-11-20' });
    expect(checkStay(product, unit, '2026-11-20', '2026-11-18', 1, none)).toMatchObject({ ok: false, reason: 'invalid_dates' });
  });

  it('checks single-date services against weekdays and capacity', () => {
    const tueThu = { ...unit, weekdays: [2, 4], defaultAllotment: 10 };
    expect(checkDate(product, tueThu, '2026-11-17', 3, overridesIndex([]))).toMatchObject({ ok: true });
    expect(checkDate(product, tueThu, '2026-11-16', 1, overridesIndex([]))).toMatchObject({ ok: false, reason: 'not_offered' });
  });
});

describe('cancellation fees (CAN-1)', () => {
  it('uses the policy band for the days before service', () => {
    expect(cancellationFee(unit.policy, 20, 200_000)).toBe(0);
    expect(cancellationFee(unit.policy, 10, 200_000)).toBe(100_000); // TESTING_STRATEGY golden: 10 days → 50%
    expect(cancellationFee(unit.policy, 3, 200_000)).toBe(200_000);
    expect(cancellationFee({ nonRefundable: true, rules: [] }, 60, 200_000)).toBe(200_000);
    expect(cancellationFee({ nonRefundable: false, rules: [{ daysBefore: 0, feeType: 'nights', value: 1 }] }, 2, 300_000, 3)).toBe(100_000);
    expect(cancellationFee({ nonRefundable: false, rules: [{ daysBefore: 0, feeType: 'fixed', value: 250 }] }, 2, 100_000)).toBe(25_000);
  });
});
