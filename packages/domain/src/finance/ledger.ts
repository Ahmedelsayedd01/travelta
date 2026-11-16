import type { CancellationPolicy, Installment } from '@travelta/schemas';
import { cancellationFee } from '../inventory/availability';
import { refreshStatuses } from '../payments/installments';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export interface PostingLine { debitMinor: number; creditMinor: number }

export class UnbalancedEntryError extends Error {
  constructor(readonly debitMinor: number, readonly creditMinor: number) { super(`Journal entry is not balanced: Dr ${debitMinor} ≠ Cr ${creditMinor}`); }
}

/**
 * ACC-1: every entry balances (Σ debits = Σ credits), has at least two non-zero lines, and each line is one-sided
 * with non-negative integer amounts. Throws UnbalancedEntryError (or a plain Error for malformed lines).
 */
export function assertBalanced(lines: readonly PostingLine[]): void {
  const live = lines.filter((l) => l.debitMinor !== 0 || l.creditMinor !== 0);
  if (live.length < 2) throw new Error('A journal entry needs at least two lines');
  for (const l of live) {
    if (!Number.isInteger(l.debitMinor) || !Number.isInteger(l.creditMinor) || l.debitMinor < 0 || l.creditMinor < 0) throw new Error('Journal amounts are non-negative integers');
    if (l.debitMinor > 0 && l.creditMinor > 0) throw new Error('A journal line is either a debit or a credit');
  }
  const dr = live.reduce((a, l) => a + l.debitMinor, 0);
  const cr = live.reduce((a, l) => a + l.creditMinor, 0);
  if (dr !== cr) throw new UnbalancedEntryError(dr, cr);
}

/** Signed amount helper: positive → debit, negative → credit. Lets posting rules express plugs without branching. */
export function signed<T extends object>(base: T, amountMinor: number): T & PostingLine {
  return { ...base, debitMinor: Math.max(0, amountMinor), creditMinor: Math.max(0, -amountMinor) };
}

/** Normal-balance view: assets and expenses grow with debits; liabilities, equity and revenue with credits. */
export function naturalBalance(type: AccountType, debitMinor: number, creditMinor: number): number {
  return type === 'asset' || type === 'expense' ? debitMinor - creditMinor : creditMinor - debitMinor;
}

export interface TrialBalanceRow { accountId: string; debitMinor: number; creditMinor: number; balanceMinor: number }

/** ACC-3 trial balance: per-account totals; Σ debits = Σ credits whenever every entry balanced. */
export function trialBalance(
  entries: readonly { date: string; lines: readonly (PostingLine & { accountId: string })[] }[],
  accounts: readonly { id: string; type: AccountType }[],
  range: { from?: string; to?: string } = {},
): { rows: TrialBalanceRow[]; totalDebitMinor: number; totalCreditMinor: number } {
  const totals = new Map<string, { dr: number; cr: number }>();
  for (const e of entries) {
    if ((range.from && e.date < range.from) || (range.to && e.date > range.to)) continue;
    for (const l of e.lines) {
      const t = totals.get(l.accountId) ?? { dr: 0, cr: 0 };
      t.dr += l.debitMinor;
      t.cr += l.creditMinor;
      totals.set(l.accountId, t);
    }
  }
  const rows = accounts.map((a) => {
    const t = totals.get(a.id) ?? { dr: 0, cr: 0 };
    return { accountId: a.id, debitMinor: t.dr, creditMinor: t.cr, balanceMinor: naturalBalance(a.type, t.dr, t.cr) };
  });
  return { rows, totalDebitMinor: rows.reduce((s, r) => s + r.debitMinor, 0), totalCreditMinor: rows.reduce((s, r) => s + r.creditMinor, 0) };
}

/** P&L from the trial balance: revenue − expenses (profit is computed from posted entries, never estimated). */
export function profitAndLoss(rows: readonly TrialBalanceRow[], types: ReadonlyMap<string, AccountType>): { revenueMinor: number; expenseMinor: number; profitMinor: number } {
  const revenueMinor = rows.filter((r) => types.get(r.accountId) === 'revenue').reduce((s, r) => s + r.balanceMinor, 0);
  const expenseMinor = rows.filter((r) => types.get(r.accountId) === 'expense').reduce((s, r) => s + r.balanceMinor, 0);
  return { revenueMinor, expenseMinor, profitMinor: revenueMinor - expenseMinor };
}

/** ACC-3 receivables ageing buckets by days past due. */
export const AGEING_BUCKETS = ['current', 'd0_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export function ageingBucket(daysPastDue: number): AgeingBucket {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return 'd0_30';
  if (daysPastDue <= 60) return 'd31_60';
  if (daysPastDue <= 90) return 'd61_90';
  return 'd90_plus';
}

// ---- Cancellation (CAN-1..3) ----------------------------------------------------------------------------------------
export interface CancellationQuoteInput {
  policy: CancellationPolicy;
  daysBefore: number;
  nights: number;
  /** Customer price incl. tax (sell). */
  sellMinor: number;
  /** Supplier net. */
  netMinor: number;
  adminFeeMinor: number;
}
export interface CancellationQuote { customerFeeMinor: number; supplierFeeMinor: number; adminFeeMinor: number; retainedMinor: number; creditMinor: number }

/**
 * CAN-1/2: the policy snapshot gives the customer fee on the sell price and the supplier fee on the net; an agency admin
 * fee is added on top. The retained amount never exceeds the cancelled value; the credit note covers the rest.
 */
export function cancellationQuote(i: CancellationQuoteInput): CancellationQuote {
  const customerFeeMinor = cancellationFee(i.policy, i.daysBefore, i.sellMinor, i.nights);
  const supplierFeeMinor = cancellationFee(i.policy, i.daysBefore, i.netMinor, i.nights);
  const adminFeeMinor = Math.min(i.adminFeeMinor, Math.max(0, i.sellMinor - customerFeeMinor));
  const retainedMinor = Math.min(i.sellMinor, customerFeeMinor + adminFeeMinor);
  return { customerFeeMinor, supplierFeeMinor, adminFeeMinor, retainedMinor, creditMinor: i.sellMinor - retainedMinor };
}

/**
 * CAN-3: refund = what was paid beyond what the customer still owes (remaining items + retained fees), floored at 0.
 * For a single-item booking this is exactly "amount paid − fee".
 */
export function refundDue(paidMinor: number, refundedMinor: number, stillOwedMinor: number): number {
  return Math.max(0, paidMinor - refundedMinor - stillOwedMinor);
}

/**
 * After a cancellation the plan must total the new amount due. Unpaid amounts are trimmed from the latest instalment
 * backwards; an instalment with nothing paid and nothing left becomes `cancelled`.
 */
export function reshapePlan(rows: readonly Installment[], newTotalMinor: number, today: string): Installment[] {
  const current = rows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + r.amountMinor, 0);
  let excess = Math.max(0, current - newTotalMinor);
  const next = [...rows].sort((a, b) => b.seq - a.seq).map((r) => {
    if (excess === 0 || r.status === 'cancelled') return r;
    const unpaid = r.amountMinor - r.paidMinor;
    const cut = Math.min(excess, Math.max(0, unpaid));
    excess -= cut;
    const amountMinor = r.amountMinor - cut;
    return { ...r, amountMinor, status: amountMinor === 0 ? ('cancelled' as const) : r.status };
  });
  return refreshStatuses(next.sort((a, b) => a.seq - b.seq).map((r) => (r.amountMinor === 0 ? { ...r, status: 'cancelled' as const } : r)), today);
}

/** Booking payment status (W6): derived from what is due vs what was collected and refunded. */
export function bookingPaymentStatus(dueMinor: number, paidMinor: number, refundedMinor: number, authorizedMinor: number): 'unpaid' | 'authorized' | 'partially_paid' | 'paid' | 'refunded' {
  const net = paidMinor - refundedMinor;
  if (dueMinor === 0 && paidMinor > 0 && net === 0) return 'refunded';
  if (net >= dueMinor && (dueMinor > 0 || paidMinor > 0)) return 'paid';
  if (net > 0) return 'partially_paid';
  if (authorizedMinor > 0) return 'authorized';
  return 'unpaid';
}

/** INV-3 invoice status from what is still due on it. */
export function invoiceStatus(totalMinor: number, creditedMinor: number, paidMinor: number, anyPayment: boolean): 'issued' | 'partially_paid' | 'paid' | 'void' {
  const due = totalMinor - creditedMinor;
  if (due <= 0 && !anyPayment) return 'void';
  if (paidMinor >= due) return 'paid';
  return paidMinor > 0 ? 'partially_paid' : 'issued';
}

/** INV-2: invoice total = Σ item sell − discount + extra fees (after-tax adjustments). */
export function invoiceTotal(lines: readonly { amountMinor: number }[], discountMinor: number, extraFeesMinor: number): number {
  return lines.reduce((s, l) => s + l.amountMinor, 0) - discountMinor + extraFeesMinor;
}

/**
 * Keep a plan equal to what is due after a change (rejection, cancellation, invoice adjustment): decreases trim unpaid
 * amounts from the newest instalment back (`reshapePlan`); increases go to the newest open instalment, or a new one due today.
 */
export function fitPlan(rows: readonly Installment[], newTotalMinor: number, today: string): Installment[] {
  const current = rows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + r.amountMinor, 0);
  if (newTotalMinor < current) return reshapePlan(rows, newTotalMinor, today);
  if (newTotalMinor === current) return refreshStatuses(rows, today);
  const extra = newTotalMinor - current;
  const open = [...rows].reverse().find((r) => r.status !== 'cancelled' && r.paidMinor < r.amountMinor);
  if (open) return refreshStatuses(rows.map((r) => (r.seq === open.seq ? { ...r, amountMinor: r.amountMinor + extra } : r)), today);
  const seq = Math.max(0, ...rows.map((r) => r.seq)) + 1;
  return refreshStatuses([...rows, { seq, amountMinor: extra, dueDate: today, paidMinor: 0, status: 'pending' }], today);
}
