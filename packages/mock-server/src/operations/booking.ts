import type { BookingEntity } from '@travelta/schemas';
import { listPage } from '../query';
import { assertPermission, requirePrincipal } from '../security';
import { bookingDto, bookingListItem, canSeeBooking, getBookingScoped, submitCheckout } from '../services/booking';
import { submitHooks } from '../services/booking/hooks';
import { auditItem, boardItem, bookWithAdapter, confirmItem, markNoShow, rejectItem, requireAction, voucherItem } from '../services/booking/lifecycle';
import { createId } from '@travelta/shared';
import { forbidden } from '../errors';
import { addManualItem, addOfferItem, applyPromo, cartDto, cartViewer, loadCart, priceManual, recheckCart, saveCart } from '../services/cart';
import { customerTenants, getCustomerScoped, saveCustomer } from '../services/customers';
import { invalid } from '../errors';
import { projectBreakdown } from '../services/pricing';
import { linkRequestBooking } from '../services/crm';
import { bookingSubmitted } from '../services/notifications/events';
import type { HandlerMap } from './types';

type Ops =
  | 'bookings.board' | 'bookings.confirmItem' | 'bookings.rejectItem' | 'bookings.voucherItem' | 'bookings.markNoShow' | 'bookings.retrySupplier'
  | 'bookings.updateItemDetails' | 'bookings.addNote' | 'bookings.supplierLogs'
  | 'customers.list' | 'customers.get' | 'customers.save'
  | 'cart.get' | 'cart.addOffer' | 'cart.applyPromo' | 'cart.previewManual' | 'cart.addManual' | 'cart.removeItem'
  | 'checkout.recheck' | 'checkout.submit' | 'bookings.list' | 'bookings.get';

export const bookingHandlers: HandlerMap<Ops> = {
  'customers.list': (ctx, query) => {
    const p = assertPermission(ctx, 'customers.view');
    const tenants = customerTenants(ctx, p);
    const bookings = ctx.db.filter('bookings', (b) => b.customerId !== null && tenants.has(b.tenantId));
    const rows = ctx.db.filter('customers', (c) => tenants.has(c.tenantId)).map((c) => {
      const mine = bookings.filter((b) => b.customerId === c.id && b.status !== 'cancelled');
      return { ...c, bookingsCount: mine.length, totalSpentMinor: mine.reduce((a, b) => a + b.totals.sellMinor, 0) };
    });
    return listPage(rows, query, {
      search: (c) => [c.name, c.email, c.phone],
      sortable: { name: (c) => c.name, createdAt: (c) => c.createdAt, totalSpent: (c) => c.totalSpentMinor },
      defaultSort: 'name:asc',
      filters: { kind: (c, v) => v.includes(c.kind), customerType: (c, v) => v.includes(c.customerType), tag: (c, v) => c.tags.some((t) => v.includes(t)) },
    });
  },
  'customers.get': (ctx, { id }) => getCustomerScoped(ctx, assertPermission(ctx, 'customers.view'), id),
  'customers.save': (ctx, input) => saveCustomer(ctx, assertPermission(ctx, 'customers.manage'), input),

  'cart.get': (ctx, { storefront } = {}) => {
    const viewer = cartViewer(ctx, storefront);
    return cartDto(ctx, loadCart(ctx, viewer, storefront), viewer);
  },
  'cart.addOffer': (ctx, input) => {
    const viewer = cartViewer(ctx, input.storefront);
    return cartDto(ctx, addOfferItem(ctx, loadCart(ctx, viewer, input.storefront), input), viewer);
  },
  'cart.previewManual': (ctx, input) => {
    const viewer = cartViewer(ctx);
    // Redacted like every other price: agencies never see the platform layer of network suppliers.
    return { breakdown: projectBreakdown(priceManual(ctx, viewer, input).breakdown, viewer.audience) };
  },
  'cart.addManual': (ctx, input) => {
    const viewer = cartViewer(ctx);
    return cartDto(ctx, addManualItem(ctx, loadCart(ctx, viewer), viewer, input), viewer);
  },
  'cart.applyPromo': (ctx, { code, storefront }) => {
    const viewer = cartViewer(ctx, storefront);
    return cartDto(ctx, applyPromo(ctx, loadCart(ctx, viewer, storefront), viewer, code, storefront), viewer);
  },
  'cart.removeItem': (ctx, { itemId, storefront }) => {
    const viewer = cartViewer(ctx, storefront);
    const cart = loadCart(ctx, viewer, storefront);
    if (!cart.items.some((i) => i.id === itemId)) throw invalid([{ field: 'itemId', issue: 'validation.invalid_value' }]);
    return cartDto(ctx, saveCart(ctx, { ...cart, items: cart.items.filter((i) => i.id !== itemId) }), viewer);
  },
  'checkout.recheck': (ctx, { storefront } = {}) => {
    const viewer = cartViewer(ctx, storefront);
    const { cart, changes } = recheckCart(ctx, loadCart(ctx, viewer, storefront), viewer, storefront);
    return { cart: cartDto(ctx, cart, viewer), changes };
  },
  'checkout.submit': (ctx, input) => {
    const viewer = cartViewer(ctx, input.storefront);
    const p = requirePrincipal(ctx);
    // A replayed idempotency key returns the original booking even though the cart is already checked out.
    const replay = ctx.db.find('bookings', (b) => b.idempotencyKey === input.idempotencyKey && b.createdByUserId === p.user.id);
    const booking: BookingEntity = replay ?? submitCheckout(ctx, loadCart(ctx, viewer, input.storefront), viewer, input, submitHooks);
    if (!replay && input.requestId) linkRequestBooking(ctx, input.requestId, booking);
    if (!replay) bookingSubmitted(ctx, ctx.db.get('bookings', booking.id)!);
    return bookingDto(ctx, p, ctx.db.get('bookings', booking.id)!);
  },

  'bookings.list': (ctx, query) => {
    const p = requirePrincipal(ctx);
    const rows = ctx.db.filter('bookings', (b) => canSeeBooking(ctx, p, b)).map((b) => bookingListItem(ctx, p, b));
    return listPage(rows, query, {
      search: (b) => [b.ref, b.customerName, b.leadTraveller, b.title.en, b.title.ar, b.sellerName],
      sortable: { createdAt: (b) => b.createdAt, travelStart: (b) => b.travelStart, total: (b) => b.totalMinor, ref: (b) => b.ref },
      defaultSort: 'createdAt:desc',
      filters: {
        status: (b, v) => v.includes(b.status),
        paymentStatus: (b, v) => v.includes(b.paymentStatus),
        service: (b, v) => b.services.some((s) => v.includes(s)),
        channel: (b, v) => v.includes(b.channel),
        hold: (b, v) => b.holdReasons.some((h) => v.includes(h)),
        overdue: (b, v) => v.includes(String(b.overdueConfirmation)),
        when: (b, v) => {
          const today = ctx.clock.today();
          return v.some((w) => (w === 'upcoming' ? b.travelStart > today : w === 'current' ? b.travelStart <= today && b.travelEnd >= today : b.travelEnd < today));
        },
      },
    });
  },
  'bookings.get': (ctx, { id }) => {
    const { booking, principal } = getBookingScoped(ctx, id);
    return bookingDto(ctx, principal, booking);
  },

  'bookings.board': (ctx, query) => {
    const p = assertPermission(ctx, 'bookings.view');
    const bookings = new Map(ctx.db.filter('bookings', (b) => canSeeBooking(ctx, p, b)).map((b) => [b.id, b]));
    const rows = ctx.db.filter('bookingItems', (i) => bookings.has(i.bookingId) && (p.org.type !== 'supplier' || i.supplierOrgId === p.org.id))
      .map((i) => boardItem(ctx, p, bookings.get(i.bookingId)!, i));
    return listPage(rows, query, {
      search: (r) => [r.ref, r.leadTraveller, r.title.en, r.title.ar, r.supplierName, r.supplierRef, r.sellerName],
      sortable: { createdAt: (r) => r.createdAt, from: (r) => r.from, ref: (r) => r.ref },
      defaultSort: 'from:asc',
      filters: {
        status: (r, v) => v.includes(r.status),
        service: (r, v) => v.includes(r.serviceType),
        hold: (r, v) => r.holdReason !== null && v.includes(r.holdReason),
        overdue: (r, v) => v.includes(String(r.overdueConfirmation)),
        actionable: (r, v) => v.includes(String(r.actions.length > 0)),
      },
    });
  },
  'bookings.confirmItem': (ctx, { bookingId, itemId, supplierRef, details }) => {
    const { booking, principal, item } = requireAction(ctx, bookingId, itemId, 'confirm');
    const next = confirmItem(ctx, booking, item, supplierRef, details);
    auditItem(ctx, booking, next, next.status === 'confirmed' ? 'confirmed' : 'rejected');
    return bookingDto(ctx, principal, ctx.db.get('bookings', booking.id)!);
  },
  'bookings.rejectItem': (ctx, { bookingId, itemId, reason }) => {
    const { booking, principal, item } = requireAction(ctx, bookingId, itemId, 'reject');
    auditItem(ctx, booking, rejectItem(ctx, booking, item, reason), 'rejected');
    return bookingDto(ctx, principal, ctx.db.get('bookings', booking.id)!);
  },
  'bookings.voucherItem': (ctx, { bookingId, itemId }) => {
    const { booking, principal, item } = requireAction(ctx, bookingId, itemId, 'voucher');
    auditItem(ctx, booking, voucherItem(ctx, booking, item), 'vouchered');
    return bookingDto(ctx, principal, ctx.db.get('bookings', booking.id)!);
  },
  'bookings.markNoShow': (ctx, { bookingId, itemId }) => {
    const { booking, principal, item } = requireAction(ctx, bookingId, itemId, 'no_show');
    auditItem(ctx, booking, markNoShow(ctx, booking, item), 'no_show');
    return bookingDto(ctx, principal, ctx.db.get('bookings', booking.id)!);
  },
  'bookings.retrySupplier': (ctx, { bookingId, itemId }) => {
    const { booking, principal, item } = requireAction(ctx, bookingId, itemId, 'retry');
    bookWithAdapter(ctx, booking, item);
    return bookingDto(ctx, principal, ctx.db.get('bookings', booking.id)!);
  },
  'bookings.updateItemDetails': (ctx, { bookingId, itemId, details }) => {
    const p = assertPermission(ctx, 'bookings.update_details');
    const { booking, principal } = getBookingScoped(ctx, bookingId);
    const item = ctx.db.get('bookingItems', itemId);
    if (!item || item.bookingId !== booking.id) throw invalid([{ field: 'itemId', issue: 'validation.invalid_value' }]);
    if (p.org.type === 'supplier' && item.supplierOrgId !== p.org.id) throw forbidden();
    if (['cancelled', 'rejected', 'travelled', 'no_show'].includes(item.status)) throw invalid([{ field: 'details', issue: 'validation.invalid_value' }], 'Closed items cannot be edited');
    const next = { ...item, details: { ...item.details, ...details }, updatedAt: ctx.clock.nowIso(), version: item.version + 1 };
    ctx.db.replace('bookingItems', next);
    auditItem(ctx, booking, next, 'details_updated');
    return bookingDto(ctx, principal, booking);
  },
  'bookings.addNote': (ctx, { bookingId, text }) => {
    const { booking, principal } = getBookingScoped(ctx, bookingId);
    if (principal.user.userType !== 'staff' || principal.org.type === 'supplier') throw forbidden('Only the seller and the platform keep booking notes');
    const now = ctx.clock.nowIso();
    const next = { ...booking, notes: [...booking.notes, { id: createId('note', ctx.clock.now()), at: now, userId: principal.user.id, userName: principal.user.name, text }], updatedAt: now, version: booking.version + 1 };
    ctx.db.replace('bookings', next);
    return bookingDto(ctx, principal, next);
  },
  'bookings.supplierLogs': (ctx, { bookingId }) => {
    const { booking, principal } = getBookingScoped(ctx, bookingId);
    if (principal.org.type !== 'platform') throw forbidden('Supplier logs are visible to platform staff');
    return ctx.db.filter('supplierRequestLogs', (l) => l.bookingId === booking.id).sort((a, b) => a.at.localeCompare(b.at));
  },
};
