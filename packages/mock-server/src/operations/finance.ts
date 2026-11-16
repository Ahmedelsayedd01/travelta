import { ageingBucket, assertBalanced, profitAndLoss, refreshStatuses, trialBalance, validateInstallments, buildSchedule } from '@travelta/domain';
import type { BookingEntity, CancellationEntity, SupplierPayableEntity, JournalEntryEntity, LedgerAccountEntity, PayableListItem, PaymentEntity, TopUpRequestEntity } from '@travelta/schemas';
import { createId, diffDays } from '@travelta/shared';
import type { RequestContext } from '../context';
import { ApiException, forbidden, invalid, notFound } from '../errors';
import { listPage } from '../query';
import { assertPermission, requirePrincipal, type Principal } from '../security';
import { audit } from '../services/audit';
import { bookingDto, canSeeBooking, getBookingScoped } from '../services/booking';
import { requireAction } from '../services/booking/lifecycle';
import { canDecideCancellation, decideCancellation, executeCancellation, quoteCancellation, requestCancellation } from '../services/finance/cancellation';
import { accountBalance, ensureLedger, financialAccountScoped, KIND_KEY, ledgerTenant, post, reverseEntry } from '../services/finance/ledger';
import { bookingFinance, canCollect, collectPayment, dueOf, moneyIn, refreshBookingMoney } from '../services/finance/money';
import { postInvoiceAdjustment, recomputeInvoice } from '../services/finance/posting';
import {
  approveCredit, canDecideTopUp, decideTopUp, holdsDetail, requestTopUp, setCreditLimit, setWalletStatus, walletDto, walletScoped,
} from '../services/finance/wallet';
import { paymentReminder } from '../services/notifications/events';
import type { HandlerMap } from './types';
import '../services/finance';

/** The ledger a staff member works in: their org's (Travelta Direct staff work in the platform ledger). */
function myLedger(ctx: RequestContext, p: Principal): string {
  if (p.user.userType !== 'staff' || p.org.type === 'supplier') throw forbidden('Accounting is kept by sellers and the platform');
  const t = ledgerTenant(ctx.db, p.org.id);
  ensureLedger(ctx, t);
  return t;
}

const sellerSide = (ctx: RequestContext, p: Principal, b: BookingEntity) =>
  p.org.type === 'platform' || b.tenantId === p.org.id || ledgerTenant(ctx.db, b.tenantId) === p.org.id;

const userName = (ctx: RequestContext, id: string | null) => (id ? ctx.db.get('users', id)?.name ?? '—' : '—');
const orgName = (ctx: RequestContext, id: string) => ctx.db.get('organizations', id)?.name.en ?? '—';

function paymentRow(ctx: RequestContext, pay: PaymentEntity) {
  const b = pay.bookingId ? ctx.db.get('bookings', pay.bookingId) : undefined;
  return {
    ...pay, bookingRef: b?.ref ?? null, customerName: pay.customerId ? ctx.db.get('customers', pay.customerId)?.name ?? null : null,
    accountNames: pay.allocations.map((a) => ctx.db.get('financialAccounts', a.financialAccountId)?.name ?? '—'),
    recordedByName: pay.recordedByUserId ? ctx.db.get('users', pay.recordedByUserId)?.name ?? null : null,
  };
}

function topUpRow(ctx: RequestContext, p: Principal, t: TopUpRequestEntity) {
  const w = ctx.db.get('wallets', t.walletId)!;
  return { ...t, ownerName: orgName(ctx, w.tenantId), requestedByName: userName(ctx, t.requestedByUserId), decidedByName: t.decidedByUserId ? userName(ctx, t.decidedByUserId) : null, canDecide: canDecideTopUp(ctx, p, t), currency: w.currency };
}

function cancellationRow(ctx: RequestContext, p: Principal, c: CancellationEntity) {
  const b = ctx.db.get('bookings', c.bookingId)!;
  return {
    ...c, bookingRef: b.ref, itemTitle: ctx.db.get('bookingItems', c.itemId)?.title ?? { en: '—', ar: '—' }, requestedByName: userName(ctx, c.requestedByUserId),
    currency: b.currency, canDecide: canDecideCancellation(ctx, p, c), canRetry: c.status === 'approved' && sellerSide(ctx, p, b) && p.permissions.has('bookings.cancel'),
    sellerName: orgName(ctx, b.tenantId),
  };
}

function journalDto(ctx: RequestContext, e: JournalEntryEntity) {
  return {
    ...e,
    lines: e.lines.map((l) => {
      const a = ctx.db.get('ledgerAccounts', l.accountId);
      return { ...l, accountCode: a?.code ?? '—', accountName: a?.name ?? { en: '—', ar: '—' } };
    }),
    totalMinor: e.lines.reduce((s, l) => s + l.debitMinor, 0), postedByName: e.postedByUserId ? userName(ctx, e.postedByUserId) : 'System',
    bookingRef: e.bookingId ? ctx.db.get('bookings', e.bookingId)?.ref ?? null : null,
    reversedBy: ctx.db.find('journalEntries', (j) => j.reversalOf === e.id)?.number ?? null,
  };
}

function ledgerAccountDto(ctx: RequestContext, a: LedgerAccountEntity, from?: string, to?: string) {
  let dr = 0;
  let cr = 0;
  for (const e of ctx.db.filter('journalEntries', (j) => j.tenantId === a.tenantId && (!from || j.date >= from) && (!to || j.date <= to))) {
    for (const l of e.lines) if (l.accountId === a.id) { dr += l.debitMinor; cr += l.creditMinor; }
  }
  return { ...a, debitMinor: dr, creditMinor: cr, balanceMinor: a.type === 'asset' || a.type === 'expense' ? dr - cr : cr - dr };
}

function payableRow(ctx: RequestContext, p: Principal, x: SupplierPayableEntity): PayableListItem {
  const item = ctx.db.get('bookingItems', x.itemId);
  return {
    ...x, bookingRef: ctx.db.get('bookings', x.bookingId)?.ref ?? '—', itemTitle: item?.title ?? { en: '—', ar: '—' }, payerName: orgName(ctx, x.tenantId),
    overdue: (x.status === 'open' || x.status === 'partially_paid') && x.dueDate < ctx.clock.today(),
    canPay: p.org.type !== 'supplier' && x.tenantId === ledgerTenant(ctx.db, p.org.id) && p.permissions.has('accounting.post_manual_entry') && (x.status === 'open' || x.status === 'partially_paid'),
    serviceDate: item?.to ?? item?.from ?? x.dueDate,
  };
}

type Ops =
  | 'payments.list' | 'payments.collect' | 'payments.overdue' | 'payments.remind' | 'payments.updatePlan' | 'bookings.finance'
  | 'finance.accounts' | 'finance.saveAccount'
  | 'wallet.get' | 'wallet.list' | 'wallet.transactions' | 'wallet.requestTopUp' | 'wallet.topUps' | 'wallet.decideTopUp' | 'wallet.setCreditLimit' | 'wallet.setStatus' | 'wallet.approveCredit'
  | 'invoices.list' | 'invoices.get' | 'invoices.update'
  | 'cancellations.quote' | 'cancellations.request' | 'cancellations.list' | 'cancellations.decide' | 'cancellations.retry'
  | 'accounting.chart' | 'accounting.saveAccount' | 'accounting.journal' | 'accounting.trialBalance' | 'accounting.postManual' | 'accounting.reverse'
  | 'accounting.expenses' | 'accounting.recordExpense' | 'accounting.transfers' | 'accounting.transfer' | 'accounting.ageing'
  | 'payables.list' | 'payables.pay';

export const financeHandlers: HandlerMap<Ops> = {
  // ---- Payments ------------------------------------------------------------------------------------------------
  'payments.list': (ctx, query) => {
    const p = assertPermission(ctx, 'payments.view');
    const rows = ctx.db.filter('payments', (x) => {
      const b = x.bookingId ? ctx.db.get('bookings', x.bookingId) : undefined;
      return !!b && sellerSide(ctx, p, b) && canSeeBooking(ctx, p, b);
    }).map((x) => paymentRow(ctx, x));
    return listPage(rows, query, {
      search: (r) => [r.reference, r.bookingRef, r.customerName, r.note],
      sortable: { receivedAt: (r) => r.receivedAt, amount: (r) => r.amountMinor },
      defaultSort: 'receivedAt:desc',
      filters: { direction: (r, v) => v.includes(r.direction), method: (r, v) => v.includes(r.method), status: (r, v) => v.includes(r.status) },
    });
  },
  'payments.collect': (ctx, input) => {
    const { booking, principal } = getBookingScoped(ctx, input.bookingId);
    collectPayment(ctx, principal, input, booking);
    return bookingFinance(ctx, principal, ctx.db.get('bookings', booking.id)!);
  },
  'payments.overdue': (ctx, query) => {
    const p = assertPermission(ctx, 'payments.view');
    const today = ctx.clock.today();
    const reminders = new Map(ctx.db.filter('auditLogs', (a) => a.action === 'payment.reminder_sent').map((a) => [a.entityId, a.at]));
    const rows = ctx.db.filter('bookings', (b) => b.status !== 'cancelled' && sellerSide(ctx, p, b) && canSeeBooking(ctx, p, b)).flatMap((b) => {
      const plan = ctx.db.find('paymentPlans', (x) => x.bookingId === b.id);
      if (!plan) return [];
      return refreshStatuses(plan.installments, today).flatMap((i) => {
        const days = diffDays(i.dueDate, today);
        const open = i.status !== 'paid' && i.status !== 'cancelled';
        if (!open || days < -3) return [];
        const bucket = days <= 0 ? 'due_soon' as const : (ageingBucket(days) as 'd0_30' | 'd31_60' | 'd61_90' | 'd90_plus');
        return [{
          bookingId: b.id, ref: b.ref, customerName: b.customerId ? ctx.db.get('customers', b.customerId)?.name ?? null : null, sellerName: orgName(ctx, b.tenantId),
          seq: i.seq, installments: plan.installments.filter((x) => x.status !== 'cancelled').length, amountMinor: i.amountMinor, paidMinor: i.paidMinor, dueDate: i.dueDate,
          daysOverdue: Math.max(0, days), status: i.status, currency: b.currency, bucket, remindedAt: reminders.get(`${b.id}:${i.seq}`) ?? null,
        }];
      });
    });
    return listPage(rows, query, {
      search: (r) => [r.ref, r.customerName, r.sellerName],
      sortable: { dueDate: (r) => r.dueDate, amount: (r) => r.amountMinor - r.paidMinor, daysOverdue: (r) => r.daysOverdue },
      defaultSort: 'dueDate:asc',
      filters: { bucket: (r, v) => v.includes(r.bucket), status: (r, v) => v.includes(r.status) },
    });
  },
  'payments.remind': (ctx, { bookingId, seq }) => {
    const { booking, principal } = getBookingScoped(ctx, bookingId);
    if (!canCollect(ctx, principal, booking)) throw forbidden('Only the seller sends payment reminders');
    const plan = ctx.db.find('paymentPlans', (x) => x.bookingId === booking.id);
    const inst = plan?.installments.find((i) => i.seq === seq);
    if (!inst || inst.status === 'paid' || inst.status === 'cancelled') throw invalid([{ field: 'seq', issue: 'validation.invalid_value' }]);
    // PAY-5 reminder (simulated channel; M19 renders it in the outbox).
    paymentReminder(ctx, booking, seq, inst.amountMinor - inst.paidMinor, inst.dueDate, `manual:${ctx.clock.nowIso()}`);
    audit(ctx, { tenantId: booking.tenantId, action: 'payment.reminder_sent', entity: 'installment', entityId: `${booking.id}:${seq}`, after: { ref: booking.ref, seq, amount: inst.amountMinor - inst.paidMinor, due: inst.dueDate } });
    return { ok: true as const };
  },
  'payments.updatePlan': (ctx, input) => {
    const { booking, principal } = getBookingScoped(ctx, input.bookingId);
    const fin = bookingFinance(ctx, principal, booking);
    if (!fin.canEditPlan) throw forbidden('The plan can be changed by the seller until the first payment');
    const today = ctx.clock.today();
    const due = dueOf(ctx.db, booking);
    if (input.type === 'partial') {
      const issues = validateInstallments(input.installments, due, today, booking.travelStart);
      if (issues.length) throw invalid(issues.map((i) => ({ field: i.index === null ? 'installments' : `installments.${i.index}.${i.field}`, issue: i.issue })), 'Instalments do not match the amount due');
    }
    const plan = ctx.db.find('paymentPlans', (x) => x.bookingId === booking.id);
    const now = ctx.clock.nowIso();
    const installments = buildSchedule(input.type, input.installments, due, today, booking.travelStart);
    if (plan) ctx.db.replace('paymentPlans', { ...plan, type: input.type, installments, updatedAt: now, version: plan.version + 1 });
    else ctx.db.insert('paymentPlans', { id: createId('plan', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: booking.tenantId, bookingId: booking.id, type: input.type, currency: booking.currency, installments });
    ctx.db.replace('bookings', { ...booking, paymentType: input.type, updatedAt: now, version: booking.version + 1 });
    audit(ctx, { tenantId: booking.tenantId, action: 'payment.plan_updated', entity: 'booking', entityId: booking.id, after: { type: input.type, installments: installments.length } });
    return bookingFinance(ctx, principal, refreshBookingMoney(ctx, booking.id));
  },
  'bookings.finance': (ctx, { bookingId }) => {
    const { booking, principal } = getBookingScoped(ctx, bookingId);
    if (principal.user.userType === 'staff' && principal.org.type === 'supplier') throw forbidden('Suppliers see their payouts in the statement');
    return bookingFinance(ctx, principal, booking);
  },

  // ---- Financial accounts ---------------------------------------------------------------------------------------
  'finance.accounts': (ctx) => {
    const p = requirePrincipal(ctx);
    if (!p.permissions.has('payments.view') && !p.permissions.has('accounting.view')) throw forbidden();
    const t = myLedger(ctx, p);
    return ctx.db.filter('financialAccounts', (f) => f.tenantId === t).map((f) => {
      const ledger = ctx.db.get('ledgerAccounts', f.ledgerAccountId)!;
      return { ...f, balanceMinor: accountBalance(ctx.db, ledger), ledgerCode: ledger.code };
    });
  },
  'finance.saveAccount': (ctx, input) => {
    const p = assertPermission(ctx, 'accounting.manage_accounts');
    const t = myLedger(ctx, p);
    const now = ctx.clock.nowIso();
    const ledgerId = ctx.db.find('ledgerAccounts', (a) => a.tenantId === t && a.systemKey === KIND_KEY[input.kind])!.id;
    let row;
    if (input.id) {
      const prev = ctx.db.get('financialAccounts', input.id);
      if (!prev || prev.tenantId !== t) throw notFound('Financial account');
      row = { ...prev, name: input.name, active: input.active, updatedAt: now, version: prev.version + 1 };
      ctx.db.replace('financialAccounts', row);
    } else {
      row = ctx.db.insert('financialAccounts', { id: createId('fac', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: t, kind: input.kind, name: input.name, ledgerAccountId: ledgerId, currency: ctx.db.get('organizations', t)!.baseCurrency, active: input.active });
    }
    audit(ctx, { tenantId: t, action: input.id ? 'finance.account_updated' : 'finance.account_created', entity: 'financialAccount', entityId: row.id, after: { name: row.name, kind: row.kind, active: row.active } });
    const ledger = ctx.db.get('ledgerAccounts', row.ledgerAccountId)!;
    return { ...row, balanceMinor: accountBalance(ctx.db, ledger), ledgerCode: ledger.code };
  },

  // ---- Wallet ------------------------------------------------------------------------------------------------------
  'wallet.get': (ctx, { walletId } = {}) => {
    const p = requirePrincipal(ctx);
    const w = walletScoped(ctx, p, walletId);
    const holder = w.heldAtOrgId === p.org.id;
    return {
      wallet: walletDto(ctx.db, w), holds: holdsDetail(ctx.db, w),
      canManageCredit: holder && p.permissions.has('wallet.credit_manage'), canApproveTopUps: holder && p.permissions.has('wallet.top_up_approve'),
      canRequestTopUp: w.tenantId === p.org.id && p.permissions.has('wallet.top_up_request'),
    };
  },
  'wallet.list': (ctx, query) => {
    const p = assertPermission(ctx, 'wallet.view');
    const rows = ctx.db.filter('wallets', (w) => w.heldAtOrgId === p.org.id || (p.org.type === 'platform' && p.permissions.has('wallet.view'))).map((w) => walletDto(ctx.db, w));
    return listPage(rows, query, {
      search: (w) => [w.ownerName, w.holderName],
      sortable: { ownerName: (w) => w.ownerName, balance: (w) => w.balanceMinor, available: (w) => w.availableMinor, creditUsed: (w) => w.creditUsedMinor },
      defaultSort: 'ownerName:asc',
      filters: { status: (w, v) => v.includes(w.status), attention: (w, v) => v.includes(String(w.awaitingMinor > 0 || w.pendingTopUps > 0 || w.creditUsedMinor > 0)) },
    });
  },
  'wallet.transactions': (ctx, query) => {
    const p = requirePrincipal(ctx);
    const w = walletScoped(ctx, p, query.walletId);
    return listPage(ctx.db.filter('walletTransactions', (t) => t.walletId === w.id), query, {
      search: (t) => [t.note], sortable: { at: (t) => t.at, amount: (t) => t.amountMinor }, defaultSort: 'at:desc', filters: { type: (t, v) => v.includes(t.type) },
    });
  },
  'wallet.requestTopUp': (ctx, input) => requestTopUp(ctx, requirePrincipal(ctx), input),
  'wallet.topUps': (ctx, query) => {
    const p = assertPermission(ctx, 'wallet.view');
    const rows = ctx.db.filter('topUpRequests', (t) => {
      const w = ctx.db.get('wallets', t.walletId);
      return !!w && (w.tenantId === p.org.id || w.heldAtOrgId === p.org.id);
    }).map((t) => topUpRow(ctx, p, t));
    return listPage(rows, query, {
      search: (t) => [t.ownerName, t.reference], sortable: { createdAt: (t) => t.createdAt, amount: (t) => t.amountMinor }, defaultSort: 'createdAt:desc',
      filters: { status: (t, v) => v.includes(t.status), mine: (t, v) => v.includes(String(ctx.db.get('wallets', t.walletId)!.tenantId === p.org.id)) },
    });
  },
  'wallet.decideTopUp': (ctx, { id, decision, reason, financialAccountId }) => {
    const p = requirePrincipal(ctx);
    const t = ctx.db.get('topUpRequests', id);
    if (!t) throw notFound('Top-up request');
    return topUpRow(ctx, p, decideTopUp(ctx, p, t, decision, reason, financialAccountId));
  },
  'wallet.setCreditLimit': (ctx, { walletId, creditLimitMinor }) => {
    const p = requirePrincipal(ctx);
    return walletDto(ctx.db, setCreditLimit(ctx, p, walletScoped(ctx, p, walletId), creditLimitMinor));
  },
  'wallet.setStatus': (ctx, { walletId, status }) => {
    const p = requirePrincipal(ctx);
    return walletDto(ctx.db, setWalletStatus(ctx, p, walletScoped(ctx, p, walletId), status));
  },
  'wallet.approveCredit': (ctx, { bookingId, itemId }) => {
    const { booking, principal, item } = requireAction(ctx, bookingId, itemId, 'approve_credit');
    approveCredit(ctx, principal, booking, item);
    return bookingDto(ctx, principal, ctx.db.get('bookings', booking.id)!);
  },

  // ---- Invoices ----------------------------------------------------------------------------------------------------
  'invoices.list': (ctx, query) => {
    const p = assertPermission(ctx, 'invoices.view');
    const rows = ctx.db.filter('invoices', (i) => {
      const b = ctx.db.get('bookings', i.bookingId);
      return !!b && sellerSide(ctx, p, b) && canSeeBooking(ctx, p, b) && p.org.type !== 'supplier';
    }).map((i) => ({ ...i, bookingRef: ctx.db.get('bookings', i.bookingId)!.ref, sellerName: orgName(ctx, i.tenantId) }));
    return listPage(rows, query, {
      search: (i) => [i.number, i.bookingRef, i.billTo.name], sortable: { issuedAt: (i) => i.issuedAt, total: (i) => i.totalMinor, number: (i) => i.number },
      defaultSort: 'issuedAt:desc', filters: { status: (i, v) => v.includes(i.status) },
    });
  },
  'invoices.get': (ctx, { id }) => {
    const p = requirePrincipal(ctx);
    const inv = ctx.db.get('invoices', id);
    const b = inv ? ctx.db.get('bookings', inv.bookingId) : undefined;
    if (!inv || !b || !canSeeBooking(ctx, p, b) || (p.user.userType === 'staff' && (p.org.type === 'supplier' || !sellerSide(ctx, p, b)))) throw notFound('Invoice');
    if (p.user.userType === 'staff' && !p.permissions.has('invoices.view')) throw forbidden('Missing permission: invoices.view');
    const seller = ctx.db.get('organizations', inv.tenantId)!;
    const { paid, refunded } = moneyIn(ctx.db, b.id);
    return {
      ...inv, bookingRef: b.ref, seller: { name: seller.name.en, legalName: seller.legalName, city: seller.city, country: seller.countryIso2 },
      creditNotes: ctx.db.filter('creditNotes', (c) => c.invoiceId === inv.id), payments: ctx.db.filter('payments', (x) => x.bookingId === b.id && x.status === 'succeeded').map((x) => paymentRow(ctx, x)),
      canEdit: p.user.userType === 'staff' && p.permissions.has('invoices.issue') && (p.org.id === inv.tenantId || p.org.id === ledgerTenant(ctx.db, inv.tenantId)) && inv.status !== 'void',
      dueMinor: inv.totalMinor - inv.creditedMinor - (paid - refunded),
    };
  },
  'invoices.update': (ctx, input) => {
    const p = assertPermission(ctx, 'invoices.issue');
    const inv = ctx.db.get('invoices', input.id);
    if (!inv || (p.org.id !== inv.tenantId && p.org.id !== ledgerTenant(ctx.db, inv.tenantId))) throw notFound('Invoice');
    if (inv.status === 'void') throw new ApiException('INVALID_TRANSITION', 'A void invoice cannot change');
    const gross = inv.lines.reduce((s, l) => s + l.amountMinor, 0) - inv.creditedMinor;
    if (input.discountMinor > gross + input.extraFeesMinor) throw invalid([{ field: 'discountMinor', issue: 'validation.discount_too_high' }]);
    const b = ctx.db.get('bookings', inv.bookingId)!;
    const { paid, refunded } = moneyIn(ctx.db, b.id);
    const newDue = dueOf(ctx.db, b) - (inv.extraFeesMinor - inv.discountMinor) + (input.extraFeesMinor - input.discountMinor);
    if (newDue < paid - refunded) throw invalid([{ field: 'discountMinor', issue: 'validation.below_paid' }], 'The invoice would fall below what was already paid');
    postInvoiceAdjustment(ctx, inv, input.discountMinor - inv.discountMinor, input.extraFeesMinor - inv.extraFeesMinor);
    const next = recomputeInvoice({ ...inv, discountMinor: input.discountMinor, extraFeesMinor: input.extraFeesMinor, notes: input.notes, updatedAt: ctx.clock.nowIso(), version: inv.version + 1 });
    ctx.db.replace('invoices', next);
    refreshBookingMoney(ctx, b.id);
    audit(ctx, { tenantId: inv.tenantId, action: 'invoice.updated', entity: 'invoice', entityId: inv.id, before: { discount: inv.discountMinor, fees: inv.extraFeesMinor }, after: { discount: input.discountMinor, fees: input.extraFeesMinor } });
    return financeHandlers['invoices.get'](ctx, { id: inv.id });
  },

  // ---- Cancellations -----------------------------------------------------------------------------------------------
  'cancellations.quote': (ctx, { bookingId, itemId }) => {
    const { booking, principal, item } = requireAction(ctx, bookingId, itemId, 'cancel');
    return quoteCancellation(ctx, principal, booking, item);
  },
  'cancellations.request': (ctx, { bookingId, itemId, reason, refundMethod }) => {
    const { booking, principal, item } = requireAction(ctx, bookingId, itemId, 'cancel');
    requestCancellation(ctx, principal, booking, item, reason, refundMethod);
    return bookingDto(ctx, principal, ctx.db.get('bookings', booking.id)!);
  },
  'cancellations.list': (ctx, query) => {
    const p = requirePrincipal(ctx);
    if (p.user.userType !== 'staff' || p.org.type === 'supplier') throw forbidden();
    const rows = ctx.db.filter('cancellations', (c) => {
      const b = ctx.db.get('bookings', c.bookingId);
      return !!b && canSeeBooking(ctx, p, b) && sellerSide(ctx, p, b);
    }).map((c) => cancellationRow(ctx, p, c));
    return listPage(rows, query, {
      search: (c) => [c.bookingRef, c.itemTitle.en, c.itemTitle.ar, c.reason, c.requestedByName], sortable: { createdAt: (c) => c.createdAt, refund: (c) => c.refundMinor },
      defaultSort: 'createdAt:desc', filters: { status: (c, v) => v.includes(c.status), actionable: (c, v) => v.includes(String(c.canDecide || c.canRetry)) },
    });
  },
  'cancellations.decide': (ctx, { id, decision, reason }) => {
    const p = requirePrincipal(ctx);
    const c = ctx.db.get('cancellations', id);
    if (!c) throw notFound('Cancellation');
    return cancellationRow(ctx, p, decideCancellation(ctx, p, c, decision, reason));
  },
  'cancellations.retry': (ctx, { id }) => {
    const p = requirePrincipal(ctx);
    const c = ctx.db.get('cancellations', id);
    if (!c) throw notFound('Cancellation');
    if (!cancellationRow(ctx, p, c).canRetry) throw forbidden('Nothing to retry');
    return cancellationRow(ctx, p, executeCancellation(ctx, c));
  },

  // ---- Accounting ---------------------------------------------------------------------------------------------------
  'accounting.chart': (ctx) => {
    const p = assertPermission(ctx, 'accounting.view');
    const t = myLedger(ctx, p);
    return ctx.db.filter('ledgerAccounts', (a) => a.tenantId === t).sort((a, b) => a.code.localeCompare(b.code)).map((a) => ledgerAccountDto(ctx, a));
  },
  'accounting.saveAccount': (ctx, input) => {
    const p = assertPermission(ctx, 'accounting.manage_accounts');
    const t = myLedger(ctx, p);
    if (ctx.db.find('ledgerAccounts', (a) => a.tenantId === t && a.code === input.code && a.id !== input.id)) throw invalid([{ field: 'code', issue: 'validation.code_taken' }]);
    const now = ctx.clock.nowIso();
    let row: LedgerAccountEntity;
    if (input.id) {
      const prev = ctx.db.get('ledgerAccounts', input.id);
      if (!prev || prev.tenantId !== t) throw notFound('Account');
      // System accounts keep their type and code: posting rules depend on them.
      row = { ...prev, name: input.name, active: prev.systemKey ? true : input.active, code: prev.systemKey ? prev.code : input.code, type: prev.systemKey ? prev.type : input.type, updatedAt: now, version: prev.version + 1 };
      ctx.db.replace('ledgerAccounts', row);
    } else {
      row = ctx.db.insert('ledgerAccounts', { id: createId('lac', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: t, code: input.code, name: input.name, type: input.type, systemKey: null, active: input.active });
    }
    audit(ctx, { tenantId: t, action: input.id ? 'accounting.account_updated' : 'accounting.account_created', entity: 'ledgerAccount', entityId: row.id, after: { code: row.code, name: row.name.en } });
    return ledgerAccountDto(ctx, row);
  },
  'accounting.journal': (ctx, query) => {
    const p = assertPermission(ctx, 'accounting.view');
    const t = myLedger(ctx, p);
    const rows = ctx.db.filter('journalEntries', (e) => e.tenantId === t).map((e) => journalDto(ctx, e));
    return listPage(rows, query, {
      search: (e) => [e.number, e.memo, e.bookingRef, ...e.lines.map((l) => l.party?.name)],
      sortable: { date: (e) => `${e.date}${e.number}`, number: (e) => e.number, total: (e) => e.totalMinor },
      defaultSort: 'date:desc',
      filters: {
        source: (e, v) => v.includes(e.source),
        account: (e, v) => e.lines.some((l) => v.includes(l.accountId)),
        from: (e, v) => e.date >= v[0]!, to: (e, v) => e.date <= v[0]!,
      },
    });
  },
  'accounting.trialBalance': (ctx, { from, to } = {}) => {
    const p = assertPermission(ctx, 'accounting.view');
    const t = myLedger(ctx, p);
    const accounts = ctx.db.filter('ledgerAccounts', (a) => a.tenantId === t).sort((a, b) => a.code.localeCompare(b.code));
    const tb = trialBalance(ctx.db.filter('journalEntries', (e) => e.tenantId === t), accounts, { from, to });
    const pnl = profitAndLoss(tb.rows, new Map(accounts.map((a) => [a.id, a.type])));
    return {
      currency: ctx.db.get('organizations', t)!.baseCurrency, from: from ?? null, to: to ?? null,
      rows: accounts.map((a, i) => ({ ...a, debitMinor: tb.rows[i]!.debitMinor, creditMinor: tb.rows[i]!.creditMinor, balanceMinor: tb.rows[i]!.balanceMinor })),
      totalDebitMinor: tb.totalDebitMinor, totalCreditMinor: tb.totalCreditMinor, ...pnl,
    };
  },
  'accounting.postManual': (ctx, input) => {
    const p = assertPermission(ctx, 'accounting.post_manual_entry');
    const t = myLedger(ctx, p);
    try { assertBalanced(input.lines); } catch (e) { throw invalid([{ field: 'lines', issue: 'validation.unbalanced' }], (e as Error).message); }
    input.lines.forEach((l, i) => {
      const a = ctx.db.get('ledgerAccounts', l.accountId);
      if (!a || a.tenantId !== t || !a.active) throw invalid([{ field: `lines.${i}.accountId`, issue: 'validation.invalid_value' }]);
    });
    const e = post(ctx, { tenantId: t, memo: input.memo, source: 'adjustment', sourceId: null, date: input.date, lines: input.lines.map((l) => ({ accountId: l.accountId, debitMinor: l.debitMinor, creditMinor: l.creditMinor })) })!;
    audit(ctx, { tenantId: t, action: 'accounting.manual_entry', entity: 'journalEntry', entityId: e.id, after: { number: e.number, memo: e.memo } });
    return journalDto(ctx, e);
  },
  'accounting.reverse': (ctx, { entryId, memo }) => {
    const p = assertPermission(ctx, 'accounting.post_manual_entry');
    const t = myLedger(ctx, p);
    const e = ctx.db.get('journalEntries', entryId);
    if (!e || e.tenantId !== t) throw notFound('Journal entry');
    const r = reverseEntry(ctx, e, memo);
    audit(ctx, { tenantId: t, action: 'accounting.entry_reversed', entity: 'journalEntry', entityId: e.id, after: { reversal: r.number } });
    return journalDto(ctx, r);
  },
  'accounting.expenses': (ctx, query) => {
    const p = assertPermission(ctx, 'accounting.view');
    const t = myLedger(ctx, p);
    const rows = ctx.db.filter('expenses', (x) => x.tenantId === t).map((x) => ({ ...x, accountName: ctx.db.get('financialAccounts', x.financialAccountId)?.name ?? '—', recordedByName: userName(ctx, x.recordedByUserId) }));
    return listPage(rows, query, { search: (x) => [x.description], sortable: { date: (x) => x.date, amount: (x) => x.amountMinor }, defaultSort: 'date:desc', filters: { category: (x, v) => v.includes(x.category) } });
  },
  'accounting.recordExpense': (ctx, input) => {
    const p = assertPermission(ctx, 'accounting.post_manual_entry');
    const t = myLedger(ctx, p);
    const fin = financialAccountScoped(ctx, t, input.financialAccountId);
    const id = createId('exp', ctx.clock.now());
    const key = ({ general: 'expense_general', rent: 'expense_rent', salaries: 'expense_salaries', marketing: 'expense_marketing' } as const)[input.category];
    const e = post(ctx, { tenantId: t, memo: `Expense · ${input.description}`, source: 'expense', sourceId: id, date: input.date, lines: [{ key, debitMinor: input.amountMinor, creditMinor: 0 }, { accountId: fin.ledgerAccountId, debitMinor: 0, creditMinor: input.amountMinor }] })!;
    const now = ctx.clock.nowIso();
    const row = ctx.db.insert('expenses', { id, createdAt: now, updatedAt: now, version: 1, tenantId: t, category: input.category, description: input.description, amountMinor: input.amountMinor, currency: fin.currency, financialAccountId: fin.id, date: input.date, journalEntryId: e.id, recordedByUserId: p.user.id });
    audit(ctx, { tenantId: t, action: 'accounting.expense_recorded', entity: 'expense', entityId: id, after: { amount: input.amountMinor, category: input.category } });
    return { ...row, accountName: fin.name, recordedByName: p.user.name };
  },
  'accounting.transfers': (ctx, query) => {
    const p = assertPermission(ctx, 'accounting.view');
    const t = myLedger(ctx, p);
    const name = (id: string) => ctx.db.get('financialAccounts', id)?.name ?? '—';
    const rows = ctx.db.filter('transfers', (x) => x.tenantId === t).map((x) => ({ ...x, fromName: name(x.fromAccountId), toName: name(x.toAccountId) }));
    return listPage(rows, query, { search: (x) => [x.note, x.fromName, x.toName], sortable: { date: (x) => x.date, amount: (x) => x.amountMinor }, defaultSort: 'date:desc' });
  },
  'accounting.transfer': (ctx, input) => {
    const p = assertPermission(ctx, 'accounting.post_manual_entry');
    const t = myLedger(ctx, p);
    const from = financialAccountScoped(ctx, t, input.fromAccountId);
    const to = financialAccountScoped(ctx, t, input.toAccountId);
    const id = createId('trf', ctx.clock.now());
    const e = post(ctx, { tenantId: t, memo: `Transfer ${from.name} → ${to.name}${input.note ? ` · ${input.note}` : ''}`, source: 'transfer', sourceId: id, date: input.date, lines: [{ accountId: to.ledgerAccountId, debitMinor: input.amountMinor, creditMinor: 0 }, { accountId: from.ledgerAccountId, debitMinor: 0, creditMinor: input.amountMinor }] });
    const now = ctx.clock.nowIso();
    // Same-ledger-account transfers (e.g. two bank accounts) net to nothing in the ledger but are still recorded.
    const row = ctx.db.insert('transfers', { id, createdAt: now, updatedAt: now, version: 1, tenantId: t, fromAccountId: from.id, toAccountId: to.id, amountMinor: input.amountMinor, currency: from.currency, date: input.date, note: input.note, journalEntryId: e?.id ?? '', recordedByUserId: p.user.id });
    audit(ctx, { tenantId: t, action: 'accounting.transfer', entity: 'transfer', entityId: id, after: { amount: input.amountMinor, from: from.name, to: to.name } });
    return { ...row, fromName: from.name, toName: to.name };
  },
  'accounting.ageing': (ctx) => {
    const p = assertPermission(ctx, 'accounting.view');
    const t = myLedger(ctx, p);
    const today = ctx.clock.today();
    const rows = new Map<string, { customerId: string | null; customerName: string; currentMinor: number; d0_30Minor: number; d31_60Minor: number; d61_90Minor: number; d90PlusMinor: number; totalMinor: number }>();
    for (const b of ctx.db.filter('bookings', (x) => ledgerTenant(ctx.db, x.tenantId) === t && x.status !== 'cancelled')) {
      const plan = ctx.db.find('paymentPlans', (x) => x.bookingId === b.id);
      if (!plan) continue;
      const key = b.customerId ?? b.id;
      const row = rows.get(key) ?? { customerId: b.customerId, customerName: b.customerId ? ctx.db.get('customers', b.customerId)?.name ?? b.leadTraveller : b.leadTraveller, currentMinor: 0, d0_30Minor: 0, d31_60Minor: 0, d61_90Minor: 0, d90PlusMinor: 0, totalMinor: 0 };
      for (const i of plan.installments) {
        const open = i.status === 'cancelled' ? 0 : i.amountMinor - i.paidMinor;
        if (open <= 0) continue;
        const bucket = ageingBucket(diffDays(i.dueDate, today));
        const field = ({ current: 'currentMinor', d0_30: 'd0_30Minor', d31_60: 'd31_60Minor', d61_90: 'd61_90Minor', d90_plus: 'd90PlusMinor' } as const)[bucket];
        row[field] += open;
        row.totalMinor += open;
      }
      if (row.totalMinor > 0) rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.totalMinor - a.totalMinor);
  },

  // ---- Supplier payables -------------------------------------------------------------------------------------------
  'payables.list': (ctx, query) => {
    const p = requirePrincipal(ctx);
    if (p.user.userType !== 'staff') throw forbidden();
    if (p.org.type === 'supplier' ? !p.permissions.has('accounting.view') : !(p.permissions.has('accounting.view') || p.permissions.has('payments.view'))) throw forbidden();
    const t = p.org.type === 'supplier' ? null : ledgerTenant(ctx.db, p.org.id);
    const rows = ctx.db.filter('supplierPayables', (x) => (t ? x.tenantId === t : x.supplierRefId === p.org.id)).map((x) => payableRow(ctx, p, x));
    return listPage(rows, query, {
      search: (x) => [x.bookingRef, x.supplierName, x.itemTitle.en, x.itemTitle.ar], sortable: { dueDate: (x) => x.dueDate, amount: (x) => x.amountDueMinor - x.amountPaidMinor },
      defaultSort: 'dueDate:asc', filters: { status: (x, v) => v.includes(x.status), overdue: (x, v) => v.includes(String(x.overdue)), supplierKind: (x, v) => v.includes(x.supplierKind) },
    });
  },
  'payables.pay': (ctx, { id, amountMinor, financialAccountId, reference }) => {
    const p = assertPermission(ctx, 'accounting.post_manual_entry');
    const x = ctx.db.get('supplierPayables', id);
    if (!x) throw notFound('Payable');
    const row = payableRow(ctx, p, x);
    if (!row.canPay) throw forbidden('You cannot pay this payable');
    const remaining = x.amountDueMinor - x.amountPaidMinor;
    if (amountMinor > remaining) throw invalid([{ field: 'amountMinor', issue: 'validation.overpayment', params: { max: remaining } }]);
    const fin = financialAccountScoped(ctx, x.tenantId, financialAccountId);
    post(ctx, {
      tenantId: x.tenantId, memo: `Supplier payout · ${x.supplierName} · ${row.bookingRef}${reference ? ` · ${reference}` : ''}`, source: 'payout', sourceId: x.id, bookingId: x.bookingId, currency: x.currency,
      lines: [{ key: 'ap_supplier', debitMinor: amountMinor, creditMinor: 0, party: { kind: 'supplier', id: x.supplierRefId, name: x.supplierName } }, { accountId: fin.ledgerAccountId, debitMinor: 0, creditMinor: amountMinor }],
    });
    const paid = x.amountPaidMinor + amountMinor;
    const next = { ...x, amountPaidMinor: paid, status: paid >= x.amountDueMinor ? 'paid' as const : 'partially_paid' as const, updatedAt: ctx.clock.nowIso(), version: x.version + 1 };
    ctx.db.replace('supplierPayables', next);
    audit(ctx, { tenantId: x.tenantId, action: 'payable.paid', entity: 'supplierPayable', entityId: x.id, after: { amount: amountMinor, supplier: x.supplierName } });
    return payableRow(ctx, p, next);
  },
};

