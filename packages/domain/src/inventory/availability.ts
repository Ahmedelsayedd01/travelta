import type { CalendarOverrideEntity, CancellationPolicy, ProductEntity, RateUnit } from '@travelta/schemas';
import { diffDays, divRoundHalfUp, eachDate } from '@travelta/shared';

/** Friday & Saturday are the weekend in Egypt and the Gulf (weekend uplift days). */
export const WEEKEND_DAYS = [5, 6];

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export type OverrideLookup = (unitId: string, date: string) => Pick<CalendarOverrideEntity, 'allotment' | 'sold' | 'stopSell' | 'netMinor'> | undefined;

export function overridesIndex(rows: readonly CalendarOverrideEntity[]): OverrideLookup {
  const map = new Map(rows.map((r) => [`${r.unitId}|${r.date}`, r]));
  return (unitId, date) => map.get(`${unitId}|${date}`);
}

/** Net for one unit on one date (INVT-1): explicit override, else base × weekend uplift × season uplift. */
export function netOn(product: Pick<ProductEntity, 'seasons'>, unit: RateUnit, date: string, override?: { netMinor: number | null }): number {
  if (override?.netMinor != null) return override.netMinor;
  let pctTimes100 = 10_000n;
  if (WEEKEND_DAYS.includes(weekday(date)) && unit.weekendUpliftPct > 0) pctTimes100 = (pctTimes100 * BigInt(Math.round((100 + unit.weekendUpliftPct) * 100))) / 10_000n;
  const season = product.seasons.find((s) => s.from <= date && date <= s.to);
  if (season) pctTimes100 = (pctTimes100 * BigInt(Math.round((100 + season.upliftPct) * 100))) / 10_000n;
  return Number(divRoundHalfUp(BigInt(unit.baseNetMinor) * pctTimes100, 10_000n));
}

export interface DayAvailability {
  date: string;
  offered: boolean;
  allotment: number;
  sold: number;
  available: number;
  stopSell: boolean;
  netMinor: number;
  overridden: boolean;
}

/** Availability of one unit on one date (INVT-2/3). */
export function dayAvailability(product: Pick<ProductEntity, 'seasons'>, unit: RateUnit, date: string, lookup: OverrideLookup): DayAvailability {
  const o = lookup(unit.id, date);
  const offered = unit.weekdays.length === 0 || unit.weekdays.includes(weekday(date));
  const allotment = o?.allotment ?? unit.defaultAllotment;
  const sold = o?.sold ?? 0;
  const stopSell = o?.stopSell ?? false;
  const available = offered && !stopSell ? Math.max(0, allotment - sold) : 0;
  return { date, offered, allotment, sold, available, stopSell, netMinor: netOn(product, unit, date, o), overridden: o !== undefined };
}

export type StayCheck =
  | { ok: true; nights: DayAvailability[]; totalNetMinor: number }
  | { ok: false; reason: 'min_stay' | 'sold_out' | 'not_offered' | 'invalid_dates'; date?: string; minStay?: number };

/**
 * A stay (or a multi-day service) needs `quantity` units free on EVERY night from start (inclusive) to end (exclusive),
 * no stop-sell, and the unit's minimum stay (INVT-2). Returns per-night nets for pricing.
 */
export function checkStay(product: Pick<ProductEntity, 'seasons'>, unit: RateUnit, start: string, end: string, quantity: number, lookup: OverrideLookup): StayCheck {
  const nights = diffDays(start, end);
  if (nights < 1) return { ok: false, reason: 'invalid_dates' };
  if (nights < unit.minStay) return { ok: false, reason: 'min_stay', minStay: unit.minStay };
  const days = eachDate(start, end).map((d) => dayAvailability(product, unit, d, lookup));
  const closed = days.find((d) => !d.offered);
  if (closed) return { ok: false, reason: 'not_offered', date: closed.date };
  const full = days.find((d) => d.available < quantity);
  if (full) return { ok: false, reason: 'sold_out', date: full.date };
  return { ok: true, nights: days, totalNetMinor: days.reduce((a, d) => a + d.netMinor, 0) };
}

/** Single-date availability for dated services (tour departure, activity slot, transfer, flight, Umrah departure). */
export function checkDate(product: Pick<ProductEntity, 'seasons'>, unit: RateUnit, date: string, quantity: number, lookup: OverrideLookup): StayCheck {
  const d = dayAvailability(product, unit, date, lookup);
  if (!d.offered) return { ok: false, reason: 'not_offered', date };
  if (d.available < quantity) return { ok: false, reason: 'sold_out', date };
  return { ok: true, nights: [d], totalNetMinor: d.netMinor };
}

/**
 * Cancellation fee from a policy snapshot (CAN-1/2): the rule with the largest `daysBefore` that is ≤ the actual
 * days before service applies. `nights` fees use the average nightly amount. Non-refundable = full amount.
 */
export function cancellationFee(policy: CancellationPolicy, daysBeforeService: number, amountMinor: number, nights = 1): number {
  if (policy.nonRefundable) return amountMinor;
  const rule = [...policy.rules].sort((a, b) => b.daysBefore - a.daysBefore).find((r) => daysBeforeService >= r.daysBefore);
  if (!rule) return amountMinor;
  if (rule.feeType === 'percent') return Number(divRoundHalfUp(BigInt(amountMinor) * BigInt(Math.round(rule.value * 100)), 10_000n));
  if (rule.feeType === 'fixed') return Math.min(amountMinor, Math.round(rule.value * 100));
  const nightly = Number(divRoundHalfUp(BigInt(amountMinor), BigInt(Math.max(1, nights))));
  return Math.min(amountMinor, nightly * rule.value);
}
