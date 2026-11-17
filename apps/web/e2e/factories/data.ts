/**
 * Test data factories: unique, collision-free values so tests never depend on each other or on execution order.
 * Every test also starts from freshly seeded demo data (one browser context = one IndexedDB), so nothing created
 * here leaks into another test.
 */
let counter = 0;
const stamp = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A unique e-mail on a reserved test domain (never a real mailbox). */
export const uniqueEmail = (prefix = 'e2e') => `${prefix}.${stamp()}@example.test`;
/** A unique, human-readable name suffix. */
export const uniqueName = (prefix: string) => `${prefix} ${stamp().slice(-6).toUpperCase()}`;
/** ISO date `days` from today (UTC), for searches and validity windows that must stay in the future. */
export const isoDays = (days: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
/** The next date (at least `minDays` ahead) that falls on one of `weekdays` (0 = Sunday). For timetabled services. */
export function nextWeekday(weekdays: number[], minDays = 21): string {
  for (let i = minDays; i < minDays + 14; i++) if (weekdays.includes(new Date(`${isoDays(i)}T00:00:00Z`).getUTCDay())) return isoDays(i);
  return isoDays(minDays);
}

/** Card numbers of the demo payment simulator (BUSINESS_RULES PAY-6/7). */
export const CARDS = { ok: '4242 4242 4242 4242', declined: '4000 0000 0000 0002', threeDs: '4000 0000 0000 3220' } as const;
/** A strong password that satisfies the password policy. */
export const strongPassword = () => `Trip#${stamp().slice(-6)}A1`;
