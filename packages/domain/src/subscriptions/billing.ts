import { addDays, diffDays } from '@travelta/shared';

export type SubStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;

/** Period length for a billing cycle (prototype: 30 / 365 days). */
export const periodDays = (cycle: 'monthly' | 'yearly') => (cycle === 'monthly' ? 30 : 365);

/**
 * SUB-4 proration: an upgrade credits the unused share of the current plan and charges the new plan for the rest of
 * the period, rounded to the minor unit. Returns the amount due now (never negative).
 */
export function proration(currentPriceMinor: number, newPriceMinor: number, periodStart: string, periodEnd: string, today: string) {
  const total = Math.max(1, diffDays(periodStart, periodEnd));
  const remaining = Math.min(total, Math.max(0, diffDays(today, periodEnd)));
  const creditMinor = Math.round((currentPriceMinor * remaining) / total);
  const chargeMinor = Math.round((newPriceMinor * remaining) / total);
  return { remainingDays: remaining, totalDays: total, creditMinor, chargeMinor, dueMinor: Math.max(0, chargeMinor - creditMinor) };
}

export interface SubClockState { status: SubStatus; trialEndsAt: string | null; currentPeriodEnd: string; pastDueSince: string | null; cancelAtPeriodEnd: boolean }
export type SubClockEvent = { kind: 'charge'; reason: 'trial_end' | 'renewal' } | { kind: 'suspend' } | { kind: 'cancel' } | null;

/**
 * SUB-2 time rules: trialing (14 d) → charge at trial end; active → renew (charge) at period end or cancel when asked;
 * past_due → suspended after the 7-day grace. The caller performs the charge and applies the outcome.
 */
export function dueClockEvent(s: SubClockState, today: string): SubClockEvent {
  if (s.status === 'trialing' && s.trialEndsAt && today >= s.trialEndsAt) return { kind: 'charge', reason: 'trial_end' };
  if (s.status === 'active' && today >= s.currentPeriodEnd) return s.cancelAtPeriodEnd ? { kind: 'cancel' } : { kind: 'charge', reason: 'renewal' };
  if (s.status === 'past_due' && s.pastDueSince && today >= addDays(s.pastDueSince, GRACE_DAYS)) return { kind: 'suspend' };
  return null;
}

/** SUB-2: a suspended or cancelled subscription blocks bookings and new users; data stays readable. */
export const subscriptionWritable = (status: SubStatus) => status === 'trialing' || status === 'active' || status === 'past_due';

/** SUB-3: limits are checked on create; `null` means unlimited. */
export function withinLimit(used: number, limit: number | null, adding = 1): boolean {
  return limit === null || used + adding <= limit;
}
