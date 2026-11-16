import { describe, expect, it } from 'vitest';
import type { Installment } from '@travelta/schemas';
import {
  ageingBucket, assertBalanced, bookingPaymentStatus, cancellationQuote, fitPlan, invoiceStatus, invoiceTotal, profitAndLoss, refundDue, reshapePlan, signed, trialBalance, UnbalancedEntryError,
} from './ledger';

const inst = (seq: number, amountMinor: number, paidMinor = 0, dueDate = `2026-12-0${seq}`): Installment => ({ seq, amountMinor, paidMinor, dueDate, status: 'pending' });
const policy = { nonRefundable: false, rules: [{ daysBefore: 14, feeType: 'percent' as const, value: 10 }, { daysBefore: 7, feeType: 'percent' as const, value: 50 }, { daysBefore: 0, feeType: 'percent' as const, value: 100 }] };

describe('ACC-1 balanced entries', () => {
  it('accepts balanced entries and rejects unbalanced, one-line or two-sided lines', () => {
    expect(() => assertBalanced([{ debitMinor: 100, creditMinor: 0 }, { debitMinor: 0, creditMinor: 60 }, { debitMinor: 0, creditMinor: 40 }])).not.toThrow();
    expect(() => assertBalanced([{ debitMinor: 100, creditMinor: 0 }, { debitMinor: 0, creditMinor: 90 }])).toThrow(UnbalancedEntryError);
    expect(() => assertBalanced([{ debitMinor: 100, creditMinor: 0 }, { debitMinor: 0, creditMinor: 0 }])).toThrow(/two lines/);
    expect(() => assertBalanced([{ debitMinor: 50, creditMinor: 50 }, { debitMinor: 0, creditMinor: 0 }, { debitMinor: 1, creditMinor: 1 }])).toThrow(/either/);
    expect(() => assertBalanced([{ debitMinor: -5, creditMinor: 0 }, { debitMinor: 0, creditMinor: -5 }])).toThrow(/non-negative/);
  });
  it('signed() turns plugs into the right side', () => {
    expect(signed({ key: 'x' }, 30)).toEqual({ key: 'x', debitMinor: 30, creditMinor: 0 });
    expect(signed({ key: 'x' }, -30)).toEqual({ key: 'x', debitMinor: 0, creditMinor: 30 });
  });
});

describe('ACC-3 trial balance & P&L', () => {
  const accounts = [{ id: 'cash', type: 'asset' as const }, { id: 'sales', type: 'revenue' as const }, { id: 'cogs', type: 'expense' as const }, { id: 'ap', type: 'liability' as const }];
  const entries = [
    { date: '2026-11-01', lines: [{ accountId: 'cash', debitMinor: 1000, creditMinor: 0 }, { accountId: 'sales', debitMinor: 0, creditMinor: 1000 }] },
    { date: '2026-11-02', lines: [{ accountId: 'cogs', debitMinor: 700, creditMinor: 0 }, { accountId: 'ap', debitMinor: 0, creditMinor: 700 }] },
    { date: '2026-12-01', lines: [{ accountId: 'ap', debitMinor: 700, creditMinor: 0 }, { accountId: 'cash', debitMinor: 0, creditMinor: 700 }] },
  ];
  it('totals per account with natural balances and equal sides', () => {
    const tb = trialBalance(entries, accounts);
    expect(tb.totalDebitMinor).toBe(tb.totalCreditMinor);
    expect(tb.rows.map((r) => r.balanceMinor)).toEqual([300, 1000, 700, 0]);
    const pnl = profitAndLoss(tb.rows, new Map(accounts.map((a) => [a.id, a.type])));
    expect(pnl).toEqual({ revenueMinor: 1000, expenseMinor: 700, profitMinor: 300 });
  });
  it('filters by date range', () => {
    const tb = trialBalance(entries, accounts, { to: '2026-11-30' });
    expect(tb.rows.find((r) => r.accountId === 'ap')!.balanceMinor).toBe(700);
  });
  it('ages receivables into 0–30 / 31–60 / 61–90 / 90+', () => {
    expect([-2, 0, 1, 30, 31, 60, 61, 90, 91].map(ageingBucket)).toEqual(['current', 'current', 'd0_30', 'd0_30', 'd31_60', 'd31_60', 'd61_90', 'd61_90', 'd90_plus']);
  });
});

describe('CAN-1..3 cancellation figures', () => {
  it('customer fee on sell, supplier fee on net, admin fee capped by what is left', () => {
    const q = cancellationQuote({ policy, daysBefore: 20, nights: 3, sellMinor: 100_000, netMinor: 70_000, adminFeeMinor: 15_000 });
    expect(q).toEqual({ customerFeeMinor: 10_000, supplierFeeMinor: 7_000, adminFeeMinor: 15_000, retainedMinor: 25_000, creditMinor: 75_000 });
    const late = cancellationQuote({ policy, daysBefore: 2, nights: 3, sellMinor: 100_000, netMinor: 70_000, adminFeeMinor: 15_000 });
    expect(late).toMatchObject({ customerFeeMinor: 100_000, adminFeeMinor: 0, retainedMinor: 100_000, creditMinor: 0 });
    const nr = cancellationQuote({ policy: { nonRefundable: true, rules: [] }, daysBefore: 30, nights: 1, sellMinor: 50_000, netMinor: 40_000, adminFeeMinor: 0 });
    expect(nr.retainedMinor).toBe(50_000);
  });
  it('refund = paid − still owed, floored at 0', () => {
    expect(refundDue(100_000, 0, 25_000)).toBe(75_000);
    expect(refundDue(10_000, 0, 25_000)).toBe(0); // unpaid fee stays a receivable
    expect(refundDue(100_000, 75_000, 25_000)).toBe(0);
  });
});

describe('plan fitting after changes', () => {
  it('trims unpaid amounts from the newest instalment backwards (golden 770 = 70 + 600 + 100)', () => {
    const rows = [inst(1, 7_000, 7_000), inst(2, 60_000), inst(3, 10_000)];
    const out = reshapePlan(rows, 50_000, '2026-11-15');
    expect(out.map((r) => [r.amountMinor, r.status])).toEqual([[7_000, 'paid'], [43_000, 'pending'], [0, 'cancelled']]);
    expect(out.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + r.amountMinor, 0)).toBe(50_000);
  });
  it('never trims below what was paid', () => {
    const out = reshapePlan([inst(1, 7_000, 7_000), inst(2, 60_000, 20_000)], 10_000, '2026-11-15');
    expect(out.map((r) => r.amountMinor)).toEqual([7_000, 20_000]);
  });
  it('adds increases to the newest open instalment, or a new one when all are paid', () => {
    expect(fitPlan([inst(1, 5_000, 5_000), inst(2, 5_000)], 12_000, '2026-11-15').map((r) => r.amountMinor)).toEqual([5_000, 7_000]);
    const paid = fitPlan([{ ...inst(1, 5_000, 5_000), status: 'paid' }], 6_000, '2026-11-15');
    expect(paid.map((r) => [r.seq, r.amountMinor, r.dueDate])).toEqual([[1, 5_000, '2026-12-01'], [2, 1_000, '2026-11-15']]);
  });
});

describe('derived statuses', () => {
  it('booking payment status (W6)', () => {
    expect(bookingPaymentStatus(1000, 0, 0, 0)).toBe('unpaid');
    expect(bookingPaymentStatus(1000, 0, 0, 1000)).toBe('authorized');
    expect(bookingPaymentStatus(1000, 400, 0, 0)).toBe('partially_paid');
    expect(bookingPaymentStatus(1000, 1000, 0, 0)).toBe('paid');
    expect(bookingPaymentStatus(0, 1000, 1000, 0)).toBe('refunded');
    expect(bookingPaymentStatus(250, 1000, 750, 0)).toBe('paid');
  });
  it('invoice status follows payments; void only when fully credited before any payment (INV-3)', () => {
    expect(invoiceStatus(1000, 0, 0, false)).toBe('issued');
    expect(invoiceStatus(1000, 0, 300, true)).toBe('partially_paid');
    expect(invoiceStatus(1000, 0, 1000, true)).toBe('paid');
    expect(invoiceStatus(1000, 1000, 0, false)).toBe('void');
    expect(invoiceStatus(1000, 1000, 0, true)).toBe('paid');
  });
  it('invoice total applies after-tax adjustments (INV-2)', () => {
    expect(invoiceTotal([{ amountMinor: 700 }, { amountMinor: 300 }], 50, 20)).toBe(970);
  });
});
