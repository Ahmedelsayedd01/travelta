import { describe, expect, it } from 'vitest';
import { dueClockEvent, proration, subscriptionWritable, withinLimit } from './billing';

describe('SUB-4 proration', () => {
  it('credits the unused share and charges the new plan for the rest of the period', () => {
    const p = proration(30_000, 90_000, '2026-11-01', '2026-12-01', '2026-11-16');
    expect(p).toEqual({ remainingDays: 15, totalDays: 30, creditMinor: 15_000, chargeMinor: 45_000, dueMinor: 30_000 });
    expect(proration(90_000, 30_000, '2026-11-01', '2026-12-01', '2026-11-16').dueMinor).toBe(0);
    expect(proration(30_000, 90_000, '2026-11-01', '2026-12-01', '2026-12-05').dueMinor).toBe(0);
  });
});

describe('SUB-2 lifecycle clock', () => {
  const base = { trialEndsAt: null, currentPeriodEnd: '2026-12-01', pastDueSince: null, cancelAtPeriodEnd: false };
  it('charges at trial end and at renewal, cancels when asked, suspends after the grace', () => {
    expect(dueClockEvent({ ...base, status: 'trialing', trialEndsAt: '2026-11-20' }, '2026-11-19')).toBeNull();
    expect(dueClockEvent({ ...base, status: 'trialing', trialEndsAt: '2026-11-20' }, '2026-11-20')).toEqual({ kind: 'charge', reason: 'trial_end' });
    expect(dueClockEvent({ ...base, status: 'active' }, '2026-12-01')).toEqual({ kind: 'charge', reason: 'renewal' });
    expect(dueClockEvent({ ...base, status: 'active', cancelAtPeriodEnd: true }, '2026-12-01')).toEqual({ kind: 'cancel' });
    expect(dueClockEvent({ ...base, status: 'past_due', pastDueSince: '2026-11-10' }, '2026-11-16')).toBeNull();
    expect(dueClockEvent({ ...base, status: 'past_due', pastDueSince: '2026-11-10' }, '2026-11-17')).toEqual({ kind: 'suspend' });
  });
  it('suspended and cancelled are read-only; limits are inclusive (SUB-3)', () => {
    expect(['trialing', 'active', 'past_due', 'suspended', 'cancelled'].map((s) => subscriptionWritable(s as never))).toEqual([true, true, true, false, false]);
    expect(withinLimit(2, 3)).toBe(true);
    expect(withinLimit(3, 3)).toBe(false);
    expect(withinLimit(99, null)).toBe(true);
  });
});
