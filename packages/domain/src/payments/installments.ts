import type { PaymentType } from '@travelta/contracts';
import type { Installment } from '@travelta/schemas';
import { addDays } from '@travelta/shared';

export interface InstallmentDraft { amountMinor: number; dueDate: string }
export interface PlanIssue { index: number | null; field: 'amountMinor' | 'dueDate' | 'installments'; issue: string }

/**
 * PAY-2: instalments sum EXACTLY to the total; each amount > 0; due dates strictly increasing, not before today and
 * not after the service start. Golden case: 770 = 70 (today) + 600 + 100.
 */
export function validateInstallments(drafts: readonly InstallmentDraft[], totalMinor: number, today: string, serviceStart: string): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (drafts.length === 0) return [{ index: null, field: 'installments', issue: 'validation.installments_required' }];
  drafts.forEach((d, i) => {
    if (!Number.isInteger(d.amountMinor) || d.amountMinor <= 0) issues.push({ index: i, field: 'amountMinor', issue: 'validation.must_be_positive' });
    if (d.dueDate < today) issues.push({ index: i, field: 'dueDate', issue: 'validation.date_in_past' });
    if (d.dueDate > serviceStart) issues.push({ index: i, field: 'dueDate', issue: 'validation.due_after_service' });
    if (i > 0 && d.dueDate <= drafts[i - 1]!.dueDate) issues.push({ index: i, field: 'dueDate', issue: 'validation.dates_increasing' });
  });
  const sum = drafts.reduce((a, d) => a + d.amountMinor, 0);
  if (sum !== totalMinor) issues.push({ index: null, field: 'installments', issue: 'validation.installments_sum' });
  return issues;
}

/** Builds the stored schedule for a plan type (PAY-1). `later` is due 3 days before service (or today if sooner). */
export function buildSchedule(type: PaymentType, drafts: readonly InstallmentDraft[], totalMinor: number, today: string, serviceStart: string): Installment[] {
  const rows: InstallmentDraft[] = type === 'full'
    ? [{ amountMinor: totalMinor, dueDate: today }]
    : type === 'later'
      ? [{ amountMinor: totalMinor, dueDate: maxDate(today, addDays(serviceStart, -3)) }]
      : [...drafts];
  return rows.map((r, i) => ({ seq: i + 1, amountMinor: r.amountMinor, dueDate: r.dueDate, paidMinor: 0, status: 'pending' }));
}

const maxDate = (a: string, b: string) => (a > b ? a : b);

/** PAY-5: unpaid instalments due before today are overdue (derived, never stored stale). */
export function installmentStatus(i: Pick<Installment, 'amountMinor' | 'paidMinor' | 'dueDate' | 'status'>, today: string): Installment['status'] {
  if (i.status === 'cancelled') return 'cancelled';
  if (i.paidMinor >= i.amountMinor) return 'paid';
  if (i.dueDate < today) return 'overdue';
  return i.paidMinor > 0 ? 'partially_paid' : 'pending';
}

export function refreshStatuses(rows: readonly Installment[], today: string): Installment[] {
  return rows.map((r) => ({ ...r, status: installmentStatus(r, today) }));
}

export class OverpaymentError extends Error {
  constructor(readonly outstandingMinor: number) { super('Payment exceeds the outstanding balance'); }
}

/**
 * PAY-4: a collection pays the oldest open instalment first unless one is chosen; overpayment is refused.
 * Returns the updated schedule and how much went to each instalment.
 */
export function applyCollection(rows: readonly Installment[], amountMinor: number, today: string, preferredSeq?: number): { installments: Installment[]; applied: { seq: number; amountMinor: number }[] } {
  const open = rows.filter((r) => r.status !== 'cancelled');
  const outstanding = open.reduce((a, r) => a + Math.max(0, r.amountMinor - r.paidMinor), 0);
  if (amountMinor > outstanding) throw new OverpaymentError(outstanding);
  const order = [...open].sort((a, b) => (a.seq === preferredSeq ? -1 : b.seq === preferredSeq ? 1 : a.seq - b.seq));
  let left = amountMinor;
  const applied: { seq: number; amountMinor: number }[] = [];
  const paid = new Map<number, number>();
  for (const r of order) {
    if (left === 0) break;
    const take = Math.min(left, r.amountMinor - r.paidMinor);
    if (take <= 0) continue;
    paid.set(r.seq, take);
    applied.push({ seq: r.seq, amountMinor: take });
    left -= take;
  }
  return { installments: refreshStatuses(rows.map((r) => ({ ...r, paidMinor: r.paidMinor + (paid.get(r.seq) ?? 0) })), today), applied };
}

/** Reverses collections from the newest instalment backwards (refunds). */
export function reverseCollection(rows: readonly Installment[], amountMinor: number, today: string): Installment[] {
  let left = amountMinor;
  const next = [...rows].sort((a, b) => b.seq - a.seq).map((r) => {
    const take = Math.min(left, r.paidMinor);
    left -= take;
    return { ...r, paidMinor: r.paidMinor - take };
  });
  return refreshStatuses(next.sort((a, b) => a.seq - b.seq), today);
}

/** PAY-3: a split collection's allocations must sum to the payment amount. */
export function allocationsBalance(amountMinor: number, allocations: readonly { amountMinor: number }[]): boolean {
  return allocations.length > 0 && allocations.every((a) => a.amountMinor > 0) && allocations.reduce((a, x) => a + x.amountMinor, 0) === amountMinor;
}
