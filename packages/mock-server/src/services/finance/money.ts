import { allocationsBalance, applyCollection, bookingPaymentStatus, fitPlan, invoiceStatus, OverpaymentError, refreshStatuses } from '@travelta/domain';
import type { BookingEntity, BookingFinance, CollectPaymentInput, PaymentEntity } from '@travelta/schemas';
import { collectPaymentInputSchema } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../../context';
import type { Database } from '../../db/database';
import { ApiException, forbidden, invalid } from '../../errors';
import type { Principal } from '../../security';
import { audit } from '../audit';
import { gatewayFor } from '../payments';
import { paymentReceived } from '../notifications/events';
import { defaultFinancialAccount, financialAccountScoped, ledgerTenant, post, type Party } from './ledger';

const CLOSED = new Set(['cancelled', 'rejected']);

/** Card authorisations are records of a hold on the card, not money received (PAY-6). */
export const isAuthorization = (p: PaymentEntity) => p.method === 'card' && p.reference.startsWith('AUTH-');

/**
 * What the customer owes right now: every item not rejected/cancelled, plus fees retained on cancellations,
 * plus the invoice's after-tax adjustments (INV-2).
 */
export function dueOf(db: Database, b: BookingEntity): number {
  const items = db.filter('bookingItems', (i) => i.bookingId === b.id && !CLOSED.has(i.status));
  const retained = db.filter('cancellations', (c) => c.bookingId === b.id && c.status === 'completed')
    .reduce((s, c) => s + c.customerFeeMinor + c.adminFeeMinor, 0);
  const inv = b.invoiceId ? db.get('invoices', b.invoiceId) : undefined;
  return items.reduce((s, i) => s + i.breakdown.totals.customerTotalMinor, 0) + retained + (inv ? inv.extraFeesMinor - inv.discountMinor : 0);
}

export function moneyIn(db: Database, bookingId: string): { paid: number; refunded: number } {
  const rows = db.filter('payments', (p) => p.bookingId === bookingId && p.status === 'succeeded' && !isAuthorization(p));
  return {
    paid: rows.filter((p) => p.direction === 'in').reduce((s, p) => s + p.amountMinor, 0),
    refunded: rows.filter((p) => p.direction === 'out').reduce((s, p) => s + p.amountMinor, 0),
  };
}

/** Still-authorised card amount: the pending items of a booking with an open authorisation. */
export function authorizedOf(db: Database, b: BookingEntity): number {
  const auth = db.find('payments', (p) => p.bookingId === b.id && isAuthorization(p) && p.status === 'authorized');
  if (!auth) return 0;
  return db.filter('bookingItems', (i) => i.bookingId === b.id && i.status === 'pending').reduce((s, i) => s + i.breakdown.totals.customerTotalMinor, 0);
}

/**
 * Re-derive every cached money figure of a booking (paid, refunded, payment status, plan statuses/amounts, invoice
 * paid/status). Called after any money event so the caches can never drift from the payment rows.
 */
export function refreshBookingMoney(ctx: RequestContext, bookingId: string): BookingEntity {
  const db = ctx.db;
  const b = db.get('bookings', bookingId)!;
  const today = ctx.clock.today();
  const { paid, refunded } = moneyIn(db, b.id);
  const due = dueOf(db, b);
  const plan = db.find('paymentPlans', (p) => p.bookingId === b.id);
  if (plan) {
    const installments = fitPlan(plan.installments, due, today);
    if (JSON.stringify(installments) !== JSON.stringify(plan.installments)) db.replace('paymentPlans', { ...plan, installments, updatedAt: ctx.clock.nowIso(), version: plan.version + 1 });
  }
  const auth = db.find('payments', (p) => p.bookingId === b.id && isAuthorization(p) && p.status === 'authorized');
  if (auth && !db.find('bookingItems', (i) => i.bookingId === b.id && i.status === 'pending')) {
    // Every item resolved: the authorisation is closed — captured (in parts) or voided.
    const captured = db.filter('payments', (p) => p.bookingId === b.id && p.reference.startsWith('CAP-')).length > 0;
    db.replace('payments', { ...auth, status: captured ? 'succeeded' : 'voided', updatedAt: ctx.clock.nowIso(), version: auth.version + 1 });
  }
  const paymentStatus = bookingPaymentStatus(due, paid, refunded, authorizedOf(db, b));
  let next = b;
  if (b.totals.paidMinor !== paid || b.totals.refundedMinor !== refunded || b.paymentStatus !== paymentStatus) {
    next = { ...b, paymentStatus, totals: { ...b.totals, paidMinor: paid, refundedMinor: refunded }, updatedAt: ctx.clock.nowIso(), version: b.version + 1 };
    db.replace('bookings', next);
  }
  if (b.invoiceId) {
    const inv = db.get('invoices', b.invoiceId)!;
    const netPaid = paid - refunded;
    const status = invoiceStatus(inv.totalMinor, inv.creditedMinor, netPaid, paid > 0);
    if (inv.paidMinor !== netPaid || inv.status !== status) db.replace('invoices', { ...inv, paidMinor: netPaid, status, updatedAt: ctx.clock.nowIso(), version: inv.version + 1 });
  }
  return next;
}

/** Who may take money for a booking: the seller (the platform for Travelta Direct sales). */
export function canCollect(ctx: RequestContext, p: Principal, b: BookingEntity): boolean {
  if (p.user.userType !== 'staff' || !p.permissions.has('payments.collect')) return false;
  return p.org.id === b.tenantId || p.org.id === ledgerTenant(ctx.db, b.tenantId);
}

const customerParty = (db: Database, b: BookingEntity): Party =>
  b.customerId ? { kind: 'customer', id: b.customerId, name: db.get('customers', b.customerId)?.name ?? b.leadTraveller } : { kind: 'customer', id: b.id, name: b.leadTraveller };

/** W6 collect payment: split across financial accounts (PAY-3), oldest instalment first (PAY-4), receipt → ledger. */
export function collectPayment(ctx: RequestContext, p: Principal, raw: CollectPaymentInput, booking: BookingEntity): PaymentEntity {
  const input = collectPaymentInputSchema.parse(raw);
  if (!canCollect(ctx, p, booking)) throw forbidden('Only the seller collects payments for this booking');
  const ledger = ledgerTenant(ctx.db, booking.tenantId);
  if (!allocationsBalance(input.amountMinor, input.allocations)) {
    throw invalid([{ field: 'allocations', issue: 'validation.allocations_sum' }], 'Allocations must add up to the amount');
  }
  const accounts = input.allocations.map((a, i) => {
    try { return financialAccountScoped(ctx, ledger, a.financialAccountId); } catch { throw invalid([{ field: `allocations.${i}.financialAccountId`, issue: 'validation.invalid_value' }]); }
  });
  const plan = ctx.db.find('paymentPlans', (x) => x.bookingId === booking.id);
  const { paid, refunded } = moneyIn(ctx.db, booking.id);
  const outstanding = dueOf(ctx.db, booking) - (paid - refunded);
  if (input.amountMinor > outstanding) {
    throw new ApiException('VALIDATION_ERROR', 'Payment exceeds the outstanding balance', [{ field: 'amountMinor', issue: 'validation.overpayment', params: { max: outstanding } }]);
  }
  const today = ctx.clock.today();
  if (plan) {
    try {
      const { installments } = applyCollection(refreshStatuses(plan.installments, today), input.amountMinor, today, input.installmentSeq);
      ctx.db.replace('paymentPlans', { ...plan, installments, updatedAt: ctx.clock.nowIso(), version: plan.version + 1 });
    } catch (e) {
      if (e instanceof OverpaymentError) throw new ApiException('VALIDATION_ERROR', e.message, [{ field: 'amountMinor', issue: 'validation.overpayment', params: { max: e.outstandingMinor } }]);
      throw e;
    }
  }
  const now = ctx.clock.nowIso();
  const method = accounts.length > 1 ? 'cash' : ({ cash: 'cash', bank: 'bank_transfer', vodafone_cash: 'vodafone_cash', instapay: 'instapay', card_gateway: 'card' } as const)[accounts[0]!.kind];
  const payment = ctx.db.insert('payments', {
    id: createId('pay', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: booking.tenantId, bookingId: booking.id, invoiceId: booking.invoiceId,
    customerId: booking.customerId, direction: 'in', method, gateway: method === 'card' ? gatewayFor(booking.currency) : 'none', amountMinor: input.amountMinor,
    currency: booking.currency, status: 'succeeded', allocations: input.allocations, reference: input.reference || `RCPT-${booking.ref.slice(4)}-${ctx.db.nextSequence(`receipt:${booking.id}`)}`,
    cardLast4: null, receivedAt: now, recordedByUserId: p.user.id, journalEntryId: null, note: input.note,
  });
  const party = customerParty(ctx.db, booking);
  const entry = post(ctx, {
    tenantId: ledger, memo: `Collection ${payment.reference} · ${booking.ref}`, source: 'payment', sourceId: payment.id, bookingId: booking.id, currency: booking.currency,
    lines: [
      ...input.allocations.map((a, i) => ({ accountId: accounts[i]!.ledgerAccountId, debitMinor: a.amountMinor, creditMinor: 0 })),
      { key: 'ar' as const, debitMinor: 0, creditMinor: input.amountMinor, party },
    ],
  });
  ctx.db.replace('payments', { ...payment, journalEntryId: entry?.id ?? null });
  const fresh = refreshBookingMoney(ctx, booking.id);
  const after = moneyIn(ctx.db, booking.id);
  paymentReceived(ctx, fresh, ctx.db.get('payments', payment.id)!, dueOf(ctx.db, fresh) - (after.paid - after.refunded));
  audit(ctx, { tenantId: booking.tenantId, action: 'payment.collected', entity: 'payment', entityId: payment.id, after: { ref: booking.ref, amount: input.amountMinor, allocations: input.allocations.length } });
  return ctx.db.get('payments', payment.id)!;
}

/** PAY-6: capture the confirmed item's amount from the open card authorisation (card clearing ← AR). */
export function captureCard(ctx: RequestContext, b: BookingEntity, itemId: string, amountMinor: number): void {
  const auth = ctx.db.find('payments', (p) => p.bookingId === b.id && isAuthorization(p) && p.status === 'authorized');
  if (!auth || amountMinor <= 0) return;
  const ledger = ledgerTenant(ctx.db, b.tenantId);
  const account = defaultFinancialAccount(ctx, ledger, 'card_gateway');
  const now = ctx.clock.nowIso();
  const item = ctx.db.get('bookingItems', itemId)!;
  const payment = ctx.db.insert('payments', {
    id: createId('pay', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: b.tenantId, bookingId: b.id, invoiceId: b.invoiceId, customerId: b.customerId,
    direction: 'in', method: 'card', gateway: auth.gateway, amountMinor, currency: b.currency, status: 'succeeded',
    allocations: [{ financialAccountId: account.id, amountMinor }], reference: `CAP-${b.ref.slice(4)}-${item.seq}`, cardLast4: auth.cardLast4,
    receivedAt: now, recordedByUserId: null, journalEntryId: null, note: 'Captured at confirmation',
  });
  const plan = ctx.db.find('paymentPlans', (x) => x.bookingId === b.id);
  if (plan) {
    const today = ctx.clock.today();
    const open = plan.installments.reduce((s, r) => s + (r.status === 'cancelled' ? 0 : r.amountMinor - r.paidMinor), 0);
    if (open >= amountMinor) ctx.db.replace('paymentPlans', { ...plan, installments: applyCollection(plan.installments, amountMinor, today).installments, version: plan.version + 1, updatedAt: now });
  }
  const entry = post(ctx, {
    tenantId: ledger, memo: `Card capture ${payment.reference}`, source: 'payment', sourceId: payment.id, bookingId: b.id, currency: b.currency,
    lines: [{ accountId: account.ledgerAccountId, debitMinor: amountMinor, creditMinor: 0 }, { key: 'ar', debitMinor: 0, creditMinor: amountMinor, party: customerParty(ctx.db, b) }],
  });
  ctx.db.replace('payments', { ...ctx.db.get('payments', payment.id)!, journalEntryId: entry?.id ?? null });
}

/** Money back to the customer (CAN-3/4): a payment `out` from a financial account (or the card gateway), AR ← account. */
export function refundCustomer(ctx: RequestContext, b: BookingEntity, amountMinor: number, method: 'card' | 'cash' | 'bank_transfer' | 'wallet', note: string, financialAccountId?: string): PaymentEntity | null {
  if (amountMinor <= 0) return null;
  const ledger = ledgerTenant(ctx.db, b.tenantId);
  const kind = method === 'card' ? 'card_gateway' : method === 'cash' ? 'cash' : 'bank';
  const account = financialAccountId ? financialAccountScoped(ctx, ledger, financialAccountId) : defaultFinancialAccount(ctx, ledger, kind);
  const auth = ctx.db.find('payments', (p) => p.bookingId === b.id && isAuthorization(p));
  const now = ctx.clock.nowIso();
  const payment = ctx.db.insert('payments', {
    id: createId('pay', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: b.tenantId, bookingId: b.id, invoiceId: b.invoiceId, customerId: b.customerId,
    direction: 'out', method: method === 'wallet' ? 'bank_transfer' : method, gateway: method === 'card' ? gatewayFor(b.currency) : 'none', amountMinor, currency: b.currency, status: 'succeeded',
    allocations: [{ financialAccountId: account.id, amountMinor }], reference: `RFND-${b.ref.slice(4)}-${ctx.db.nextSequence(`refund:${b.id}`)}`,
    cardLast4: method === 'card' ? auth?.cardLast4 ?? null : null, receivedAt: now, recordedByUserId: ctx.principal?.user.id ?? null, journalEntryId: null, note: note.slice(0, 500),
  });
  const entry = post(ctx, {
    tenantId: ledger, memo: `Refund ${payment.reference} · ${b.ref}`, source: 'refund', sourceId: payment.id, bookingId: b.id, currency: b.currency,
    lines: [{ key: 'ar', debitMinor: amountMinor, creditMinor: 0, party: customerParty(ctx.db, b) }, { accountId: account.ledgerAccountId, debitMinor: 0, creditMinor: amountMinor }],
  });
  ctx.db.replace('payments', { ...ctx.db.get('payments', payment.id)!, journalEntryId: entry?.id ?? null });
  return payment;
}

export { customerParty };

/** Read model of a booking's money for the detail page (W6). */
export function bookingFinance(ctx: RequestContext, p: Principal, b: BookingEntity): BookingFinance {
  const db = ctx.db;
  const userName = (id: string | null) => (id ? db.get('users', id)?.name ?? null : null);
  const accName = (id: string) => db.get('financialAccounts', id)?.name ?? '—';
  const { paid, refunded } = moneyIn(db, b.id);
  const due = dueOf(db, b);
  const supplierOrCustomer = p.user.userType !== 'staff' || p.org.type === 'supplier';
  const plan = db.find('paymentPlans', (x) => x.bookingId === b.id) ?? null;
  const items = new Map(db.filter('bookingItems', (i) => i.bookingId === b.id).map((i) => [i.id, i]));
  const staffView = !supplierOrCustomer;
  return {
    bookingId: b.id, currency: b.currency, dueMinor: due, paidMinor: paid, refundedMinor: refunded, outstandingMinor: due - (paid - refunded), authorizedMinor: authorizedOf(db, b),
    plan: plan ? { ...plan, installments: refreshStatuses(plan.installments, ctx.clock.today()) } : null,
    payments: db.filter('payments', (x) => x.bookingId === b.id).sort((x, y) => x.receivedAt.localeCompare(y.receivedAt)).map((x) => ({
      ...x, bookingRef: b.ref, customerName: b.customerId ? db.get('customers', b.customerId)?.name ?? null : null,
      accountNames: x.allocations.map((a) => accName(a.financialAccountId)), recordedByName: userName(x.recordedByUserId),
    })),
    invoice: b.invoiceId ? db.get('invoices', b.invoiceId) ?? null : null,
    creditNotes: db.filter('creditNotes', (c) => c.bookingId === b.id),
    cancellations: db.filter('cancellations', (c) => c.bookingId === b.id).map((c) => ({ ...c, itemTitle: items.get(c.itemId)?.title ?? { en: '—', ar: '—' }, requestedByName: userName(c.requestedByUserId) ?? '—' })),
    holds: staffView ? db.filter('walletHolds', (h) => h.bookingId === b.id && (p.org.type === 'platform' || db.get('wallets', h.walletId)?.tenantId === p.org.id || db.get('wallets', h.walletId)?.heldAtOrgId === p.org.id))
      .map((h) => ({ ...h, walletOwnerName: db.get('organizations', db.get('wallets', h.walletId)?.tenantId ?? '')?.name.en ?? '—' })) : [],
    canCollect: canCollect(ctx, p, b) && due - (paid - refunded) > 0,
    canEditPlan: canCollect(ctx, p, b) && paid === 0 && b.status !== 'cancelled' && (plan?.type !== 'full' || b.paymentStatus !== 'authorized'),
  };
}
