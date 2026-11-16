import { describe, expect, it } from 'vitest';
import { canTransition, deriveBookingStatus, bookingRef, documentNumber } from '../booking/state';
import { balanceFromTransactions, canHold, creditUsed, walletAvailable } from '../wallet/wallet';
import { allocationsBalance, applyCollection, buildSchedule, installmentStatus, OverpaymentError, reverseCollection, validateInstallments } from './installments';

const TODAY = '2026-11-16';
const START = '2026-12-20';

describe('PAY-2 instalment validation', () => {
  it('golden: 770 = 70 (today) + 600 + 100', () => {
    expect(validateInstallments([{ amountMinor: 7000, dueDate: TODAY }, { amountMinor: 60000, dueDate: '2026-12-01' }, { amountMinor: 10000, dueDate: '2026-12-15' }], 77000, TODAY, START)).toEqual([]);
  });
  it('rejects a sum that is off by one minor unit', () => {
    expect(validateInstallments([{ amountMinor: 7000, dueDate: TODAY }, { amountMinor: 69999, dueDate: '2026-12-01' }], 77000, TODAY, START))
      .toContainEqual({ index: null, field: 'installments', issue: 'validation.installments_sum' });
  });
  it('rejects zero/negative amounts, past dates, non-increasing dates and dates after the service start', () => {
    const issues = validateInstallments([
      { amountMinor: 0, dueDate: '2026-11-10' }, { amountMinor: 50000, dueDate: '2026-11-10' }, { amountMinor: 27000, dueDate: '2026-12-21' },
    ], 77000, TODAY, START).map((i) => `${i.index}:${i.issue}`);
    expect(issues).toEqual(expect.arrayContaining(['0:validation.must_be_positive', '0:validation.date_in_past', '1:validation.dates_increasing', '2:validation.due_after_service']));
  });
  it('requires at least one instalment', () => {
    expect(validateInstallments([], 100, TODAY, START)[0]!.issue).toBe('validation.installments_required');
  });
});

describe('PAY-1 schedules', () => {
  it('full is due today; later is due 3 days before service (never in the past)', () => {
    expect(buildSchedule('full', [], 5000, TODAY, START)).toEqual([{ seq: 1, amountMinor: 5000, dueDate: TODAY, paidMinor: 0, status: 'pending' }]);
    expect(buildSchedule('later', [], 5000, TODAY, START)[0]!.dueDate).toBe('2026-12-17');
    expect(buildSchedule('later', [], 5000, TODAY, '2026-11-17')[0]!.dueDate).toBe(TODAY);
  });
});

describe('PAY-4/5 collections', () => {
  const plan = buildSchedule('partial', [{ amountMinor: 7000, dueDate: TODAY }, { amountMinor: 60000, dueDate: '2026-12-01' }, { amountMinor: 10000, dueDate: '2026-12-15' }], 77000, TODAY, START);

  it('pays the oldest open instalment first and spills over', () => {
    const r = applyCollection(plan, 20000, TODAY);
    expect(r.applied).toEqual([{ seq: 1, amountMinor: 7000 }, { seq: 2, amountMinor: 13000 }]);
    expect(r.installments.map((i) => i.status)).toEqual(['paid', 'partially_paid', 'pending']);
  });
  it('honours a chosen instalment', () => {
    expect(applyCollection(plan, 10000, TODAY, 3).applied).toEqual([{ seq: 3, amountMinor: 10000 }]);
  });
  it('refuses overpayment', () => {
    expect(() => applyCollection(plan, 77001, TODAY)).toThrow(OverpaymentError);
    expect(applyCollection(plan, 77000, TODAY).installments.every((i) => i.status === 'paid')).toBe(true);
  });
  it('derives overdue for unpaid instalments past their due date', () => {
    expect(installmentStatus({ amountMinor: 100, paidMinor: 0, dueDate: '2026-11-15', status: 'pending' }, TODAY)).toBe('overdue');
    expect(installmentStatus({ amountMinor: 100, paidMinor: 40, dueDate: '2026-11-15', status: 'pending' }, TODAY)).toBe('overdue');
    expect(installmentStatus({ amountMinor: 100, paidMinor: 100, dueDate: '2026-11-15', status: 'pending' }, TODAY)).toBe('paid');
  });
  it('reverses refunds from the newest instalment back', () => {
    const paid = applyCollection(plan, 77000, TODAY).installments;
    expect(reverseCollection(paid, 15000, TODAY).map((i) => i.paidMinor)).toEqual([7000, 55000, 0]);
  });
  it('PAY-3 split allocations must sum to the payment', () => {
    expect(allocationsBalance(1000, [{ amountMinor: 600 }, { amountMinor: 400 }])).toBe(true);
    expect(allocationsBalance(1000, [{ amountMinor: 600 }, { amountMinor: 300 }])).toBe(false);
    expect(allocationsBalance(1000, [])).toBe(false);
  });
});

describe('WAL-2 wallet arithmetic', () => {
  it('available = balance + credit − holds; credit used = −balance when negative', () => {
    expect(walletAvailable({ balanceMinor: 10000, creditLimitMinor: 50000, activeHoldsMinor: 20000 })).toBe(40000);
    expect(walletAvailable({ balanceMinor: -30000, creditLimitMinor: 50000, activeHoldsMinor: 0 })).toBe(20000);
    expect(creditUsed(-30000)).toBe(30000);
    expect(creditUsed(500)).toBe(0);
    expect(canHold({ balanceMinor: 0, creditLimitMinor: 1000, activeHoldsMinor: 0 }, 1000)).toBe(true);
    expect(canHold({ balanceMinor: 0, creditLimitMinor: 1000, activeHoldsMinor: 1 }, 1000)).toBe(false);
    expect(balanceFromTransactions([{ amountMinor: 500 }, { amountMinor: -200 }])).toBe(300);
  });
});

describe('BKG-1/2 booking state', () => {
  it('allows only the documented transitions', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'vouchered')).toBe(true);
    expect(canTransition('vouchered', 'no_show')).toBe(true);
    expect(canTransition('pending', 'vouchered')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('travelled', 'cancelled')).toBe(false);
  });
  it('derives the booking status from its items', () => {
    expect(deriveBookingStatus(['pending', 'pending'])).toBe('pending');
    expect(deriveBookingStatus(['pending', 'confirmed'])).toBe('partially_confirmed');
    expect(deriveBookingStatus(['confirmed', 'vouchered', 'cancelled'])).toBe('confirmed');
    expect(deriveBookingStatus(['vouchered', 'travelled'])).toBe('vouchered');
    expect(deriveBookingStatus(['rejected', 'cancelled'])).toBe('cancelled');
    expect(deriveBookingStatus(['travelled', 'no_show'])).toBe('travelled');
  });
  it('formats references', () => {
    expect(bookingRef('2026-11-16', 42)).toBe('TRV-2611-00042');
    expect(documentNumber('INV', '2026-11-16', 123)).toBe('INV-2026-000123');
  });
});
