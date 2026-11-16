import type { BookingEntity, BookingItemEntity, CancellationEntity, PaymentEntity, QuotationEntity, SubscriptionEntity, TopUpRequestEntity } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import { bookingLink, customerContact, day, message, money, notify, notifyOrg, platformOrgId, type Sink } from './index';

const dates = (i: Pick<BookingItemEntity, 'from' | 'to'>) => {
  const a = day(i.from) as { en: string; ar: string };
  if (!i.to) return a;
  const b = day(i.to) as { en: string; ar: string };
  return { en: `${a.en} – ${b.en}`, ar: `${a.ar} – ${b.ar}` };
};
const items = (s: Sink, b: BookingEntity) => s.db.filter('bookingItems', (i) => i.bookingId === b.id).sort((x, y) => x.seq - y.seq);
const orgName = (s: Sink, id: string) => s.db.get('organizations', id)?.name ?? { en: '—', ar: '—' };

/** W2 step 8: customer acknowledgement, supplier reservation alerts, and credit approvals for parked items (WAL-4). */
export function bookingSubmitted(s: Sink, b: BookingEntity): void {
  const list = items(s, b);
  const first = list[0];
  if (!first) return;
  const c = customerContact(s.db, b);
  message(s, { tenantId: b.tenantId, topic: 'booking.created', to: c, locale: c.locale, vars: { name: c.name, ref: b.ref, title: list.length > 1 ? `${first.title.en} +${list.length - 1}` : first.title, dates: dates({ from: b.travelStart, to: b.travelEnd }), amount: money(b.totals.sellMinor, b.currency) }, related: { kind: 'booking', id: b.id }, dedupeKey: `created:${b.id}` });
  for (const i of list) {
    if (i.supplierOrgId && i.status === 'pending' && i.holdReason === 'awaiting_supplier') {
      notifyOrg(s, i.supplierOrgId, { topic: 'booking.new_reservation', permission: 'bookings.confirm', vars: { ref: b.ref, seller: orgName(s, b.tenantId), title: i.title, dates: dates(i), pax: i.travellers.length }, link: bookingLink(s.db, b, 'supplier'), dedupeKey: `newres:${i.id}` });
    }
  }
  creditApprovals(s, b);
}

/** Items waiting for an over-limit approval alert the wallet holder (platform ops or the parent agency). */
export function creditApprovals(s: Sink, b: BookingEntity): void {
  for (const i of items(s, b).filter((x) => x.status === 'pending' && x.holdReason === 'awaiting_credit_approval')) {
    for (const h of s.db.filter('walletHolds', (x) => x.itemId === i.id && x.status === 'active' && x.awaitingApproval)) {
      const w = s.db.get('wallets', h.walletId);
      if (!w) continue;
      notifyOrg(s, w.heldAtOrgId, { topic: 'booking.credit_approval', permission: 'wallet.credit_manage', vars: { ref: b.ref, agency: orgName(s, w.tenantId), title: i.title, amount: money(h.amountMinor, w.currency) }, link: bookingLink(s.db, b, w.heldAtOrgId === platformOrgId(s.db) ? 'platform' : 'seller'), dedupeKey: `credit:${h.id}` });
    }
  }
}

export function itemConfirmed(s: Sink, b: BookingEntity, i: BookingItemEntity): void {
  const vars = { ref: b.ref, title: i.title, dates: dates(i), supplier: i.supplierName, supplierRef: i.supplierRef ?? '—' };
  notifyOrg(s, b.tenantId, { topic: 'booking.confirmed', permission: 'bookings.view', vars, link: bookingLink(s.db, b, 'seller'), dedupeKey: `conf:${i.id}` });
  const c = customerContact(s.db, b);
  message(s, { tenantId: b.tenantId, topic: 'booking.confirmed', to: c, locale: c.locale, vars, related: { kind: 'booking', id: b.id }, dedupeKey: `conf:${i.id}` });
  customerInApp(s, b, 'booking.confirmed', vars, `conf:${i.id}`);
}

export function itemRejected(s: Sink, b: BookingEntity, i: BookingItemEntity, reason: string): void {
  const vars = { ref: b.ref, title: i.title, reason };
  notifyOrg(s, b.tenantId, { topic: 'booking.rejected', permission: 'bookings.view', vars, link: bookingLink(s.db, b, 'seller'), dedupeKey: `rej:${i.id}` });
  const c = customerContact(s.db, b);
  message(s, { tenantId: b.tenantId, topic: 'booking.rejected', to: c, locale: c.locale, vars, related: { kind: 'booking', id: b.id }, dedupeKey: `rej:${i.id}` });
  customerInApp(s, b, 'booking.rejected', vars, `rej:${i.id}`);
}

export function itemVouchered(s: Sink, b: BookingEntity, i: BookingItemEntity): void {
  const c = customerContact(s.db, b);
  const vars = { title: i.title, dates: dates(i), voucher: i.voucherNo ?? '—', ref: b.ref };
  message(s, { tenantId: b.tenantId, topic: 'booking.vouchered', to: c, locale: c.locale, vars, channels: ['email', 'whatsapp'], related: { kind: 'booking', id: b.id }, dedupeKey: `vch:${i.id}` });
  customerInApp(s, b, 'booking.vouchered', vars, `vch:${i.id}`);
}

export function itemCancelled(s: Sink, b: BookingEntity, i: BookingItemEntity, c: CancellationEntity): void {
  const vars = { ref: b.ref, title: i.title, fee: money(c.customerFeeMinor + c.adminFeeMinor, b.currency), refund: money(c.refundMinor, b.currency) };
  notifyOrg(s, b.tenantId, { topic: 'booking.cancelled', permission: 'bookings.view', vars, link: bookingLink(s.db, b, 'seller'), dedupeKey: `cancel:${c.id}` });
  if (i.supplierOrgId) notifyOrg(s, i.supplierOrgId, { topic: 'booking.cancelled', permission: 'bookings.view', vars: { ...vars, fee: '—', refund: '—' }, link: bookingLink(s.db, b, 'supplier'), dedupeKey: `cancel:${c.id}` });
  const contact = customerContact(s.db, b);
  message(s, { tenantId: b.tenantId, topic: 'booking.cancelled', to: contact, locale: contact.locale, vars, related: { kind: 'booking', id: b.id }, dedupeKey: `cancel:${c.id}` });
  customerInApp(s, b, 'booking.cancelled', vars, `cancel:${c.id}`);
}

export function cancellationNeedsApproval(s: Sink, b: BookingEntity, i: BookingItemEntity, c: CancellationEntity, requester: string): void {
  notifyOrg(s, b.tenantId, { topic: 'cancellation.approval', permission: 'payments.refund_approve', vars: { ref: b.ref, title: i.title, refund: money(c.refundMinor, b.currency), requester }, link: bookingLink(s.db, b, 'seller'), dedupeKey: `canapp:${c.id}` });
}

export function paymentReceived(s: Sink, b: BookingEntity, p: PaymentEntity, outstandingMinor: number): void {
  const c = customerContact(s.db, b);
  message(s, { tenantId: b.tenantId, topic: 'payment.received', to: c, locale: c.locale, vars: { name: c.name, amount: money(p.amountMinor, p.currency), ref: b.ref, receipt: p.reference, outstanding: money(Math.max(0, outstandingMinor), b.currency) }, related: { kind: 'payment', id: p.id }, dedupeKey: `rcpt:${p.id}` });
}

export function paymentReminder(s: Sink, b: BookingEntity, seq: number, openMinor: number, due: string, tag: string): void {
  const c = customerContact(s.db, b);
  message(s, { tenantId: b.tenantId, topic: 'payment.reminder', to: c, locale: c.locale, vars: { name: c.name, seq, amount: money(openMinor, b.currency), ref: b.ref, due: day(due) }, channels: ['email', 'whatsapp'], related: { kind: 'booking', id: b.id }, dedupeKey: `inst:${b.id}:${seq}:${tag}` });
}

const METHOD = { bank_transfer: { en: 'bank transfer', ar: 'تحويل بنكي' }, cash: { en: 'cash', ar: 'نقدًا' }, instapay: { en: 'InstaPay', ar: 'إنستاباي' }, vodafone_cash: { en: 'Vodafone Cash', ar: 'فودافون كاش' }, card: { en: 'card', ar: 'بطاقة' } };
export function topUpRequested(s: Sink, t: TopUpRequestEntity): void {
  const w = s.db.get('wallets', t.walletId)!;
  notifyOrg(s, w.heldAtOrgId, { topic: 'wallet.top_up_requested', permission: 'wallet.top_up_approve', vars: { agency: orgName(s, w.tenantId), amount: money(t.amountMinor, w.currency), method: METHOD[t.method], reference: t.reference }, link: w.heldAtOrgId === platformOrgId(s.db) ? '/admin/wallets' : '/agency/wallet', dedupeKey: `tup:${t.id}` });
}
export function topUpDecided(s: Sink, t: TopUpRequestEntity): void {
  const w = s.db.get('wallets', t.walletId)!;
  const decision = t.status === 'approved' ? { en: 'approved', ar: 'تم الاعتماد' } : { en: 'rejected', ar: 'مرفوض' };
  notifyOrg(s, w.tenantId, { topic: 'wallet.top_up_decided', permission: 'wallet.view', vars: { amount: money(t.amountMinor, w.currency), reference: t.reference, decision, reason: t.reason ?? '' }, link: '/agency/wallet', dedupeKey: `tupd:${t.id}` });
}

export function kycDecided(s: Sink, orgId: string, decision: 'approve' | 'reject' | 'request_changes', reason: string | null): void {
  const label = { approve: { en: 'approved', ar: 'تمت الموافقة' }, reject: { en: 'rejected', ar: 'مرفوض' }, request_changes: { en: 'changes requested', ar: 'مطلوب تعديلات' } }[decision];
  const org = s.db.get('organizations', orgId);
  notifyOrg(s, orgId, { topic: 'kyc.decided', vars: { decision: label, reason: reason ?? '' }, link: org?.type === 'supplier' ? '/supplier/kyc' : '/agency/kyc' });
}

export function quotationSent(s: Sink, q: QuotationEntity, via: 'email' | 'whatsapp'): void {
  const r = s.db.get('crmRequests', q.requestId)!;
  const party = r.customerId ? s.db.get('customers', r.customerId) : r.leadId ? s.db.get('leads', r.leadId) : undefined;
  if (!party) return;
  message(s, { tenantId: q.tenantId, topic: 'quotation.sent', to: { name: party.name, email: party.email || null, phone: party.phone || null }, vars: { name: party.name, number: q.number, title: r.title, amount: money(q.totalMinor, q.currency), valid: day(q.validUntil) }, channels: [via], related: { kind: 'quotation', id: q.id } });
}

export function subscriptionChanged(s: Sink, sub: SubscriptionEntity): void {
  const plan = s.db.get('subscriptionPlans', sub.planId);
  if (!plan) return;
  if (sub.status === 'past_due') {
    const due = sub.cycle === 'monthly' ? plan.monthlyMinor : plan.yearlyMinor;
    notifyOrg(s, sub.tenantId, { topic: 'subscription.past_due', permission: 'subscriptions.manage', vars: { amount: money(due, plan.currency), plan: plan.name, date: day(addDays(sub.pastDueSince ?? s.clock.today(), 7)) }, link: '/agency/subscription', dedupeKey: `subpd:${sub.id}:${sub.pastDueSince}` });
  }
  if (sub.status === 'suspended') notifyOrg(s, sub.tenantId, { topic: 'subscription.suspended', permission: 'subscriptions.manage', vars: { plan: plan.name }, link: '/agency/subscription', dedupeKey: `subsus:${sub.id}:${sub.updatedAt.slice(0, 10)}` });
}

/** Storefront customers with an account also get the update in their account bell. */
function customerInApp(s: Sink, b: BookingEntity, topic: 'booking.confirmed' | 'booking.rejected' | 'booking.vouchered' | 'booking.cancelled', vars: Parameters<typeof notify>[1]['vars'], key: string): void {
  const userId = b.customerId ? s.db.get('customers', b.customerId)?.userId : null;
  if (userId) notify(s, { topic, users: [userId], orgId: b.tenantId, vars, link: bookingLink(s.db, b, 'customer'), dedupeKey: `c:${key}` });
}
