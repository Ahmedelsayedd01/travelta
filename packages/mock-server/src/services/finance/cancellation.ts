import { cancellationFee, cancellationQuote, documentNumber, refundDue, signed } from '@travelta/domain';
import type { BookingEntity, BookingItemEntity, CancellationEntity, CancellationQuoteDto } from '@travelta/schemas';
import { createId, diffDays, hashString } from '@travelta/shared';
import type { RequestContext } from '../../context';
import type { Database } from '../../db/database';
import { ApiException, forbidden } from '../../errors';
import type { Principal } from '../../security';
import { audit } from '../audit';
import { isApi } from '../booking/actions';
import { logEvent } from '../booking';
import { customerParty, dueOf, isAuthorization, moneyIn, refreshBookingMoney, refundCustomer } from './money';
import { ledgerTenant, post } from './ledger';
import { recomputeInvoice, supplierParty } from './posting';
import { cancellationNeedsApproval, itemCancelled } from '../notifications/events';
import { legsFor, walletTx, ensureWallet } from './wallet';

type Lifecycle = {
  cancelPending: (ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, reason: string) => void;
  cancelConfirmed: (ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, reason: string) => void;
};
let lifecycle: Lifecycle | null = null;
/** The booking lifecycle moves the item; this module settles the money (kept apart to avoid an import cycle). */
export function bindLifecycle(l: Lifecycle): void { lifecycle = l; }

const nightsOf = (i: BookingItemEntity) => (i.serviceType === 'hotel' && i.to ? Math.max(1, diffDays(i.from, i.to)) : 1);
const platformId = (db: Database) => db.find('organizations', (o) => o.type === 'platform')!.id;

function figuresFor(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity) {
  const daysBefore = Math.max(0, diffDays(ctx.clock.today(), item.from));
  const sell = item.breakdown.totals.customerTotalMinor;
  if (item.status === 'pending') {
    // Nothing was consumed or charged yet (BKG-3): cancelling a pending item is free.
    return { daysBefore, sell, q: { customerFeeMinor: 0, supplierFeeMinor: 0, adminFeeMinor: 0, retainedMinor: 0, creditMinor: sell } };
  }
  const settings = ctx.db.find('commercialSettings', (s) => s.tenantId === b.tenantId);
  const q = cancellationQuote({ policy: item.policy, daysBefore, nights: nightsOf(item), sellMinor: sell, netMinor: item.breakdown.totals.netMinor, adminFeeMinor: settings?.cancellationAdminFeeMinor ?? 0 });
  return { daysBefore, sell, q };
}

function refundAfter(db: Database, b: BookingEntity, sell: number, retained: number): number {
  const { paid, refunded } = moneyIn(db, b.id);
  return refundDue(paid, refunded, dueOf(db, b) - sell + retained);
}

const hasCardPayments = (db: Database, b: BookingEntity) => db.find('payments', (p) => p.bookingId === b.id && p.method === 'card' && p.direction === 'in' && !isAuthorization(p)) !== undefined;

/** W7 step 1: fee preview from the policy snapshot (CAN-1/2) and the refund it leads to (CAN-3). */
export function quoteCancellation(ctx: RequestContext, p: Principal, b: BookingEntity, item: BookingItemEntity): CancellationQuoteDto {
  const { daysBefore, sell, q } = figuresFor(ctx, b, item);
  const refund = refundAfter(ctx.db, b, sell, q.retainedMinor);
  const card = hasCardPayments(ctx.db, b);
  const methods: CancellationQuoteDto['refundMethods'] = refund === 0 ? ['none'] : card ? ['card'] : ['cash', 'bank_transfer'];
  return {
    daysBefore, status: item.status as CancellationQuoteDto['status'], sellMinor: sell, customerFeeMinor: q.customerFeeMinor, adminFeeMinor: q.adminFeeMinor,
    retainedMinor: q.retainedMinor, creditMinor: q.creditMinor, refundMinor: refund, refundMethods: methods, defaultRefundMethod: methods[0]!,
    needsApproval: refund > 0 && p.user.userType === 'staff' && !p.permissions.has('payments.refund_approve'), currency: b.currency, viaAdapter: isApi(item) && item.status !== 'pending',
  };
}

/** W7: request → (approval when required, CAN-4) → execute. Customers cancel their own bookings without approval. */
export function requestCancellation(ctx: RequestContext, p: Principal, b: BookingEntity, item: BookingItemEntity, reason: string, refundMethod: CancellationEntity['refundMethod']): CancellationEntity {
  if (ctx.db.find('cancellations', (c) => c.itemId === item.id && (c.status === 'requested' || c.status === 'approved'))) throw new ApiException('CONFLICT', 'A cancellation is already in progress for this item');
  const quote = quoteCancellation(ctx, p, b, item);
  if (!quote.refundMethods.includes(refundMethod)) throw new ApiException('VALIDATION_ERROR', 'Choose a valid refund method', [{ field: 'refundMethod', issue: 'validation.invalid_value' }]);
  const now = ctx.clock.nowIso();
  const row = ctx.db.insert('cancellations', {
    id: createId('can', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: b.tenantId, bookingId: b.id, itemId: item.id, requestedByUserId: p.user.id,
    reason, daysBefore: quote.daysBefore, customerFeeMinor: quote.customerFeeMinor, supplierFeeMinor: 0, adminFeeMinor: quote.adminFeeMinor, refundMinor: quote.refundMinor,
    refundMethod, status: 'requested', decidedByUserId: null, decidedAt: null,
  });
  logEvent(ctx, b, item.id, item.status, item.status, `Cancellation requested: ${reason}`);
  audit(ctx, { tenantId: b.tenantId, action: 'cancellation.requested', entity: 'cancellation', entityId: row.id, after: { ref: b.ref, seq: item.seq, refund: quote.refundMinor } });
  if (quote.needsApproval) { cancellationNeedsApproval(ctx, b, item, row, p.user.name); return row; }
  return executeCancellation(ctx, { ...row, status: 'approved', decidedByUserId: p.user.id, decidedAt: now });
}

export const canDecideCancellation = (ctx: RequestContext, p: Principal, c: CancellationEntity) =>
  c.status === 'requested' && p.user.userType === 'staff' && p.permissions.has('payments.refund_approve')
  && (p.org.id === c.tenantId || p.org.id === ledgerTenant(ctx.db, c.tenantId) || ctx.db.get('organizations', c.tenantId)?.parentId === p.org.id);

export function decideCancellation(ctx: RequestContext, p: Principal, c: CancellationEntity, decision: 'approve' | 'reject', reason?: string): CancellationEntity {
  if (!canDecideCancellation(ctx, p, c)) throw c.status !== 'requested' ? new ApiException('INVALID_TRANSITION', `Cancellation is ${c.status}`) : forbidden('Missing permission: payments.refund_approve');
  const now = ctx.clock.nowIso();
  const b = ctx.db.get('bookings', c.bookingId)!;
  if (decision === 'reject') {
    if (!reason || reason.trim().length < 3) throw new ApiException('VALIDATION_ERROR', 'A reason is required', [{ field: 'reason', issue: 'validation.reason_required' }]);
    const next = { ...c, status: 'rejected' as const, decidedByUserId: p.user.id, decidedAt: now, updatedAt: now, version: c.version + 1 };
    ctx.db.replace('cancellations', next);
    logEvent(ctx, b, c.itemId, null, ctx.db.get('bookingItems', c.itemId)!.status, `Cancellation rejected: ${reason}`);
    return next;
  }
  return executeCancellation(ctx, { ...c, status: 'approved', decidedByUserId: p.user.id, decidedAt: now });
}

/**
 * Execute an approved cancellation: CAN-5 adapter cancel for API items (a simulated failure leaves it `approved` with a
 * retry), then the ledger reversal, wallet refunds per leg, payable reduction, credit note, customer refund and plan.
 */
export function executeCancellation(ctx: RequestContext, c: CancellationEntity): CancellationEntity {
  if (!lifecycle) throw new Error('Cancellation lifecycle not bound');
  const db = ctx.db;
  const now = ctx.clock.nowIso();
  const b = db.get('bookings', c.bookingId)!;
  const item = db.get('bookingItems', c.itemId)!;
  db.replace('cancellations', { ...c, updatedAt: now, version: c.version + 1 });
  if (!['pending', 'confirmed', 'vouchered'].includes(item.status)) throw new ApiException('INVALID_TRANSITION', `Item is ${item.status}`);

  const { sell, q } = figuresFor(ctx, b, item);
  if (item.status === 'pending') {
    lifecycle.cancelPending(ctx, b, item, `Cancelled: ${c.reason}`);
  } else {
    if (isApi(item) && !adapterCancel(ctx, b, item)) {
      const pendingRetry = { ...c, status: 'approved' as const, updatedAt: now, version: c.version + 2 };
      db.replace('cancellations', pendingRetry);
      return pendingRetry;
    }
    settleConfirmedCancellation(ctx, b, item, c, q);
    lifecycle.cancelConfirmed(ctx, db.get('bookings', b.id)!, db.get('bookingItems', item.id)!, `Cancelled: ${c.reason}`);
  }
  const fresh = db.get('bookings', b.id)!;
  const done: CancellationEntity = {
    ...db.get('cancellations', c.id)!, status: 'completed', customerFeeMinor: q.customerFeeMinor, supplierFeeMinor: q.supplierFeeMinor, adminFeeMinor: q.adminFeeMinor,
    refundMinor: 0, updatedAt: now,
  };
  db.replace('cancellations', done);
  // Refund = paid beyond what is still owed (CAN-3), back to the original method (CAN-4).
  const { paid, refunded } = moneyIn(db, b.id);
  const refund = refundDue(paid, refunded, dueOf(db, fresh));
  if (refund > 0 && c.refundMethod !== 'none') refundCustomer(ctx, fresh, refund, c.refundMethod === 'card' ? 'card' : c.refundMethod === 'cash' ? 'cash' : 'bank_transfer', `Cancellation refund · ${item.title.en}`);
  const final = { ...done, refundMinor: refund > 0 && c.refundMethod !== 'none' ? refund : 0 };
  db.replace('cancellations', final);
  void sell;
  refreshBookingMoney(ctx, b.id);
  itemCancelled(ctx, ctx.db.get('bookings', b.id)!, ctx.db.get('bookingItems', item.id)!, final);
  audit(ctx, { tenantId: b.tenantId, action: 'cancellation.completed', entity: 'cancellation', entityId: c.id, after: { ref: b.ref, fee: q.retainedMinor, refund: final.refundMinor } });
  return final;
}

/** Simulated adapter `cancel()` (CAN-5) — honours the Demo panel's forced supplier response; every call is logged. */
function adapterCancel(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity): boolean {
  const forced = ctx.admin.takeSupplierResponse();
  const ok = forced === 'auto' || forced === 'confirm';
  const now = ctx.clock.nowIso();
  ctx.db.insert('supplierRequestLogs', {
    id: createId('slog', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: b.tenantId, bookingId: b.id, itemId: item.id, provider: item.source, operation: 'cancel',
    outcome: ok ? 'confirmed' : forced === 'timeout' ? 'timeout' : 'rejected', latencyMs: forced === 'timeout' ? 30_000 : 300 + (hashString(item.id) % 700),
    request: JSON.stringify({ confirmationNo: item.supplierRef }), response: ok ? JSON.stringify({ status: 'CANCELLED' }) : JSON.stringify({ error: forced === 'timeout' ? 'SUPPLIER_TIMEOUT after 30s' : 'Cancellation refused by supplier' }), at: now,
  });
  if (!ok) logEvent(ctx, b, item.id, item.status, item.status, 'Supplier cancellation failed — retry required');
  return ok;
}

/** ACC-2 cancellation rows, mirrored from the confirmation postings. */
function settleConfirmedCancellation(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, c: CancellationEntity, q: ReturnType<typeof figuresFor>['q']): void {
  const db = ctx.db;
  const s = item.breakdown.settlement;
  const sell = item.breakdown.totals.customerTotalMinor;
  const tax = item.breakdown.totals.taxMinor;
  const seller = ledgerTenant(db, b.tenantId);
  const base = { source: 'cancellation' as const, sourceId: c.id, bookingId: b.id, currency: b.currency };
  const memo = `Cancellation · ${b.ref} · ${item.title.en}`;
  const keep = Math.min(s.supplierPayoutMinor, q.supplierFeeMinor);
  const daysBefore = Math.max(0, diffDays(ctx.clock.today(), item.from));
  const nights = nightsOf(item);

  // Customer side (seller): reverse the sale, keep the fee.
  post(ctx, { ...base, tenantId: seller, memo, lines: [
    { key: 'sales_revenue', debitMinor: sell - tax, creditMinor: 0 },
    { key: 'tax_payable', debitMinor: tax, creditMinor: 0 },
    { key: 'ar', debitMinor: 0, creditMinor: q.creditMinor, party: customerParty(db, b) },
    { key: 'fee_revenue', debitMinor: 0, creditMinor: q.retainedMinor },
  ] });

  const legs = legsFor(db, b, item);
  for (const leg of legs) {
    // Each tier gets its cost back in its wallet minus the policy fee on what it paid (B2B refunds → wallet, CAN-4).
    const back = leg.amountMinor - cancellationFee(item.policy, daysBefore, leg.amountMinor, nights);
    if (back > 0) walletTx(ctx, ensureWallet(ctx, leg.payerOrgId), 'refund_credit', back, `Cancellation · ${b.ref} · ${item.title.en}`, b.id);
    post(ctx, { ...base, tenantId: leg.payerOrgId, memo, lines: [{ key: 'prepaid_wallet', debitMinor: back, creditMinor: 0 }, { key: 'cost_of_sales', debitMinor: 0, creditMinor: back }] });
    if (leg.holderOrgId === platformId(db)) {
      const commission = s.commissionBeneficiary === 'platform' ? s.commissionMinor : 0;
      const markup = leg.amountMinor - s.supplierPayoutMinor - commission;
      const debits = s.supplierPayoutMinor - keep + commission + markup;
      post(ctx, { ...base, tenantId: leg.holderOrgId, memo, lines: [
        { key: 'ap_supplier', debitMinor: s.supplierPayoutMinor - keep, creditMinor: 0, party: supplierParty(item) },
        signed({ key: 'commission_revenue' as const }, commission),
        signed({ key: 'platform_markup_revenue' as const }, markup),
        { key: 'agency_wallet_liability', debitMinor: 0, creditMinor: back, party: { kind: 'agency', id: leg.payerOrgId, name: db.get('organizations', leg.payerOrgId)?.name.en ?? '' } },
        signed({ key: 'fee_revenue' as const }, -(debits - back)),
      ] });
    } else {
      post(ctx, { ...base, tenantId: leg.holderOrgId, memo, lines: [
        { key: 'sales_revenue', debitMinor: back, creditMinor: 0 },
        { key: 'agency_wallet_liability', debitMinor: 0, creditMinor: back, party: { kind: 'agency', id: leg.payerOrgId, name: db.get('organizations', leg.payerOrgId)?.name.en ?? '' } },
      ] });
    }
  }
  if (legs.length === 0) {
    const commission = item.breakdown.totals.netMinor - s.supplierPayoutMinor;
    post(ctx, { ...base, tenantId: seller, memo, lines: [
      { key: 'ap_supplier', debitMinor: s.supplierPayoutMinor - keep, creditMinor: 0, party: supplierParty(item) },
      signed({ key: 'commission_revenue' as const }, commission),
      { key: 'cost_of_sales', debitMinor: 0, creditMinor: s.supplierPayoutMinor - keep + commission },
    ] });
  }

  // Supplier payable keeps only the supplier's fee.
  const payable = db.find('supplierPayables', (x) => x.itemId === item.id);
  if (payable) {
    const amountDueMinor = keep;
    const status = amountDueMinor === 0 ? (payable.amountPaidMinor > 0 ? 'paid' : 'cancelled') : payable.amountPaidMinor >= amountDueMinor ? 'paid' : payable.amountPaidMinor > 0 ? 'partially_paid' : 'open';
    db.replace('supplierPayables', { ...payable, amountDueMinor, status, updatedAt: ctx.clock.nowIso(), version: payable.version + 1 });
  }

  // Credit note against the invoice for the cancelled value minus fees (CAN-3).
  const inv = b.invoiceId ? db.get('invoices', b.invoiceId) : undefined;
  if (inv && q.creditMinor > 0) {
    const today = ctx.clock.today();
    db.insert('creditNotes', {
      id: createId('crn', ctx.clock.now()), createdAt: ctx.clock.nowIso(), updatedAt: ctx.clock.nowIso(), version: 1, tenantId: inv.tenantId,
      number: documentNumber('CN', today, db.nextSequence(`creditNote:${inv.tenantId}:${today.slice(0, 4)}`)),
      invoiceId: inv.id, bookingId: b.id, itemId: item.id, cancellationId: c.id, currency: inv.currency, amountMinor: q.creditMinor, taxMinor: tax, feeMinor: q.retainedMinor, issuedAt: ctx.clock.nowIso(),
    });
    db.replace('invoices', recomputeInvoice({ ...inv, creditedMinor: inv.creditedMinor + q.creditMinor, updatedAt: ctx.clock.nowIso(), version: inv.version + 1 }));
  }
}
