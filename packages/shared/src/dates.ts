/**
 * Calendar-date helpers on ISO `YYYY-MM-DD` strings (service dates carry no time zone).
 * All arithmetic is done in UTC to avoid DST shifts.
 */
export type ISODate = string;
export type ISODateTime = string;

const DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(date: ISODate): number {
  if (!isISODate(date)) throw new RangeError(`Invalid ISO date "${date}"`);
  return Date.parse(`${date}T00:00:00Z`);
}

export const fromUtc = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: ISODate, days: number): ISODate => fromUtc(toUtc(date) + days * DAY);

/** Whole days from `a` to `b` (b − a). */
export const diffDays = (a: ISODate, b: ISODate): number => Math.round((toUtc(b) - toUtc(a)) / DAY);

/** Nights between check-in and check-out. */
export const nightsBetween = (checkIn: ISODate, checkOut: ISODate): number => diffDays(checkIn, checkOut);

export function eachDate(from: ISODate, toExclusive: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d < toExclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

export const toISODate = (instant: ISODateTime | Date): ISODate =>
  (typeof instant === 'string' ? new Date(instant) : instant).toISOString().slice(0, 10);

export const compareDates = (a: ISODate, b: ISODate): number => (a < b ? -1 : a > b ? 1 : 0);
