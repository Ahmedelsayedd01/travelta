import { createId } from '@travelta/shared';
import { ApiException, forbidden } from '../errors';
import { requireCustomer } from '../security';
import { audit } from '../services/audit';
import { getBookingScoped } from '../services/booking';
import { customerForUser } from '../services/customers';
import { defaultFinancialAccount, ledgerTenant, post } from '../services/finance/ledger';
import { bookingFinance, customerParty, dueOf, moneyIn, refreshBookingMoney } from '../services/finance/money';
import { message, notifyOrg } from '../services/notifications';
import { paymentReceived } from '../services/notifications/events';
import { authorizeCard, gatewayFor } from '../services/payments';
import type { HandlerMap } from './types';

type Ops = 'account.updateProfile' | 'account.payByCard' | 'account.support' | 'favorites.list' | 'favorites.toggle';

const MAX_FAVORITES = 200;

export const accountHandlers: HandlerMap<Ops> = {
  /** Customers only see their own saved items (the user id comes from the session, never the input). */
  'favorites.list': (ctx) => {
    const { user } = requireCustomer(ctx);
    return ctx.db.filter('favorites', (f) => f.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  'favorites.toggle': (ctx, input) => {
    const { user } = requireCustomer(ctx);
    const existing = ctx.db.find('favorites', (f) => f.userId === user.id && f.key === input.key);
    if (existing) { ctx.db.delete('favorites', existing.id); return { favorited: false }; }
    if (!ctx.db.get('destinations', input.destinationId)) throw new ApiException('VALIDATION_ERROR', 'Unknown destination', [{ field: 'destinationId', issue: 'validation.invalid_value' }]);
    if (ctx.db.filter('favorites', (f) => f.userId === user.id).length >= MAX_FAVORITES) throw new ApiException('CONFLICT', `You can save up to ${MAX_FAVORITES} favorites`);
    const now = ctx.clock.nowIso();
    ctx.db.insert('favorites', { id: createId('fav', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, userId: user.id, ...input });
    return { favorited: true };
  },


  /** Storefront profile: the user account and the customer record at the seller stay in sync. */
  'account.updateProfile': (ctx, input) => {
    const p = requireCustomer(ctx);
    const now = ctx.clock.nowIso();
    ctx.db.replace('users', { ...p.user, name: input.name, phone: input.phone || null, locale: input.locale, updatedAt: now, version: p.user.version + 1 });
    const c = customerForUser(ctx, p);
    ctx.db.replace('customers', { ...c, name: input.name, phone: input.phone, nationalityIso2: input.nationalityIso2, updatedAt: now, version: c.version + 1 });
    audit(ctx, { tenantId: c.tenantId, action: 'account.profile_updated', entity: 'user', entityId: p.user.id });
    return { name: input.name, phone: input.phone, locale: input.locale, nationalityIso2: input.nationalityIso2 };
  },

  /** Pay-later bookings (PAY-6): the customer settles the outstanding amount by card from the account (card clearing ← AR). */
  'account.payByCard': (ctx, { bookingId, card }) => {
    const p = requireCustomer(ctx);
    const { booking } = getBookingScoped(ctx, bookingId);
    if (booking.status === 'cancelled') throw new ApiException('INVALID_TRANSITION', 'The booking is cancelled');
    const m = moneyIn(ctx.db, booking.id);
    const outstanding = dueOf(ctx.db, booking) - (m.paid - m.refunded);
    if (outstanding <= 0) throw new ApiException('INVALID_TRANSITION', 'Nothing is due');
    const { last4 } = authorizeCard(card);
    const ledger = ledgerTenant(ctx.db, booking.tenantId);
    const account = defaultFinancialAccount(ctx, ledger, 'card_gateway');
    const now = ctx.clock.nowIso();
    const plan = ctx.db.find('paymentPlans', (x) => x.bookingId === booking.id);
    if (plan) {
      const installments = plan.installments.map((i) => (i.status === 'cancelled' ? i : { ...i, paidMinor: i.amountMinor }));
      ctx.db.replace('paymentPlans', { ...plan, installments, updatedAt: now, version: plan.version + 1 });
    }
    const pay = ctx.db.insert('payments', {
      id: createId('pay', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: booking.tenantId, bookingId: booking.id, invoiceId: booking.invoiceId, customerId: booking.customerId,
      direction: 'in', method: 'card', gateway: gatewayFor(booking.currency), amountMinor: outstanding, currency: booking.currency, status: 'succeeded',
      allocations: [{ financialAccountId: account.id, amountMinor: outstanding }], reference: `CARD-${booking.ref.slice(4)}-${ctx.db.nextSequence(`card:${booking.id}`)}`,
      cardLast4: last4, receivedAt: now, recordedByUserId: p.user.id, journalEntryId: null, note: 'Paid online by the customer',
    });
    const entry = post(ctx, {
      tenantId: ledger, memo: `Online card payment ${pay.reference}`, source: 'payment', sourceId: pay.id, bookingId: booking.id, currency: booking.currency,
      lines: [{ accountId: account.ledgerAccountId, debitMinor: outstanding, creditMinor: 0 }, { key: 'ar', debitMinor: 0, creditMinor: outstanding, party: customerParty(ctx.db, booking) }],
    });
    ctx.db.replace('payments', { ...pay, journalEntryId: entry?.id ?? null });
    const fresh = refreshBookingMoney(ctx, booking.id);
    paymentReceived(ctx, fresh, pay, 0);
    return bookingFinance(ctx, p, fresh);
  },

  /** Support (W12): a ticket to the seller's team (in-app) and an acknowledgement to the customer (outbox). */
  'account.support': (ctx, { topic, bookingId, message: text }) => {
    const p = requireCustomer(ctx);
    const c = customerForUser(ctx, p);
    if (bookingId) {
      const { booking } = getBookingScoped(ctx, bookingId);
      if (booking.customerId !== c.id) throw forbidden();
    }
    const ticket = `SUP-${String(ctx.db.nextSequence(`support:${c.tenantId}`)).padStart(5, '0')}`;
    const ref = bookingId ? ctx.db.get('bookings', bookingId)?.ref ?? '' : '';
    const TOPIC = { booking: { en: 'Booking', ar: 'حجز' }, payment: { en: 'Payment', ar: 'دفع' }, cancellation: { en: 'Cancellation', ar: 'إلغاء' }, other: { en: 'Other', ar: 'أخرى' } };
    const vars = { ticket, name: c.name, topic: TOPIC[topic], message: `${ref ? `${ref} — ` : ''}${text.slice(0, 300)}` };
    notifyOrg(ctx, c.tenantId, { topic: 'support.request', permission: 'bookings.view', vars, link: bookingId ? `/agency/bookings/${bookingId}` : null });
    message(ctx, { tenantId: c.tenantId, topic: 'support.request', to: { name: c.name, email: c.email || p.user.email }, locale: p.user.locale, vars, related: bookingId ? { kind: 'booking', id: bookingId } : null });
    audit(ctx, { tenantId: c.tenantId, action: 'account.support_request', entity: 'customer', entityId: c.id, after: { ticket, topic } });

    return { ticket };
  },
};
