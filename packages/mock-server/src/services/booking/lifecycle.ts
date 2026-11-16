import type { BookingItemStatus } from '@travelta/contracts';
import { assertTransition, canTransition, deriveBookingStatus, InvalidTransitionError } from '@travelta/domain';
import type { BoardItem, BookingEntity, BookingItemEntity, ItemDetails } from '@travelta/schemas';
import { createId, hashString } from '@travelta/shared';
import type { DemoClock } from '../../clock';
import type { RequestContext } from '../../context';
import type { Database } from '../../db/database';
import { ApiException, forbidden, notFound } from '../../errors';
import type { Principal } from '../../security';
import { audit } from '../audit';
import { getBookingScoped, logEvent, overdueConfirmation, refreshBookingStatus } from './index';
import { consumeStock, financeEffects, releaseStock } from './effects';
import { isApi, itemActions } from './actions';
import { itemConfirmed, itemRejected, itemVouchered } from '../notifications/events';

export { itemActions, voucherAllowed } from './actions';

type Action = BoardItem['actions'][number];

function itemScoped(ctx: RequestContext, bookingId: string, itemId: string) {
  const { booking, principal } = getBookingScoped(ctx, bookingId);
  const item = ctx.db.get('bookingItems', itemId);
  if (!item || item.bookingId !== booking.id) throw notFound('Booking item');
  return { booking, principal, item };
}

export function requireAction(ctx: RequestContext, bookingId: string, itemId: string, action: Action) {
  const s = itemScoped(ctx, bookingId, itemId);
  if (!itemActions(ctx, s.principal, s.booking, s.item).includes(action)) {
    const allowedByState = action === 'confirm' || action === 'reject' ? s.item.status === 'pending' : true;
    throw allowedByState ? forbidden(`You cannot ${action.replace('_', ' ')} this item`) : new ApiException('INVALID_TRANSITION', `Item is ${s.item.status}`);
  }
  return s;
}

function moveItem(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, to: BookingItemStatus, patch: Partial<BookingItemEntity>, reason: string | null, actor?: { id: string | null; name: string }): BookingItemEntity {
  try {
    assertTransition(item.status, to);
  } catch (e) {
    if (e instanceof InvalidTransitionError) throw new ApiException('INVALID_TRANSITION', e.message);
    throw e;
  }
  const next: BookingItemEntity = { ...item, ...patch, status: to, updatedAt: ctx.clock.nowIso(), version: item.version + 1 };
  ctx.db.replace('bookingItems', next);
  logEvent(ctx, b, item.id, item.status, to, reason, actor);
  return next;
}

/** pending → confirmed with BKG-3 side effects. Stock that is gone turns the confirmation into a rejection. */
export function confirmItem(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, supplierRef: string, details: Partial<ItemDetails> = {}, actor?: { id: string | null; name: string }): BookingItemEntity {
  if (!consumeStock(ctx, item)) return rejectItem(ctx, b, item, 'Sold out at confirmation (SOLD_OUT)', actor);
  const now = ctx.clock.nowIso();
  const next = moveItem(ctx, b, item, 'confirmed', {
    supplierRef, confirmedAt: now, holdReason: null, stockConsumed: item.productId !== null && item.consume.length > 0, details: { ...item.details, ...details },
  }, `Supplier ref ${supplierRef}`, actor);
  financeEffects.onConfirmed(ctx, ctx.db.get('bookings', b.id)!, next);
  refreshBookingStatus(ctx, b.id);
  itemConfirmed(ctx, ctx.db.get('bookings', b.id)!, next);
  return next;
}

export function rejectItem(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, reason: string, actor?: { id: string | null; name: string }): BookingItemEntity {
  const next = moveItem(ctx, b, item, 'rejected', { holdReason: null, rejectReason: reason }, reason, actor);
  financeEffects.onReleased(ctx, ctx.db.get('bookings', b.id)!, next);
  refreshBookingStatus(ctx, b.id);
  itemRejected(ctx, ctx.db.get('bookings', b.id)!, next, reason);
  return next;
}

export function voucherItem(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity): BookingItemEntity {
  const next = moveItem(ctx, b, item, 'vouchered', { voucherNo: `VCH-${b.ref.slice(4)}-${item.seq}`, voucheredAt: ctx.clock.nowIso() }, null);
  refreshBookingStatus(ctx, b.id);
  itemVouchered(ctx, ctx.db.get('bookings', b.id)!, next);
  return next;
}

export function markNoShow(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity): BookingItemEntity {
  const next = moveItem(ctx, b, item, 'no_show', {}, 'Marked as no-show');
  refreshBookingStatus(ctx, b.id);
  return next;
}

/** Cancel a still-pending item: nothing was consumed or charged, so only holds/authorisations are released. */
export function cancelPendingItem(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, reason: string): BookingItemEntity {
  const next = moveItem(ctx, b, item, 'cancelled', { holdReason: null, cancelledAt: ctx.clock.nowIso() }, reason);
  financeEffects.onReleased(ctx, ctx.db.get('bookings', b.id)!, next);
  refreshBookingStatus(ctx, b.id);
  return next;
}

/** Confirmed/vouchered → cancelled after the money side has been settled by the cancellation flow (W7). */
export function cancelConfirmedItem(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, reason: string): BookingItemEntity {
  releaseStock(ctx.db, ctx.clock.nowIso(), item);
  const next = moveItem(ctx, b, item, 'cancelled', { cancelledAt: ctx.clock.nowIso(), stockConsumed: false }, reason);
  refreshBookingStatus(ctx, b.id);
  return next;
}

// ---- Live-API adapter book() (MOCK_DATA_ARCHITECTURE §5) -----------------------------------------------------------
const SYSTEM = (source: string) => ({ id: null, name: source === 'tbo' ? 'TBO Holidays (API)' : 'Hotelbeds (API)' });

/** Simulated `book()`: confirms after a simulated delay unless the Demo panel forces another response. Every call is logged. */
export function bookWithAdapter(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity): BookingItemEntity {
  const forced = ctx.admin.takeSupplierResponse();
  const outcome = forced === 'auto' ? 'confirm' : forced;
  const latencyMs = 400 + (hashString(item.id) % 900);
  const supplierRef = `${item.source === 'tbo' ? 'TBO' : 'HB'}-${(hashString(`${item.id}:ref`) % 9_000_000) + 1_000_000}`;
  const log = (o: 'confirmed' | 'rejected' | 'pending' | 'timeout', response: string) => {
    const now = ctx.clock.nowIso();
    ctx.db.insert('supplierRequestLogs', {
      id: createId('slog', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: b.tenantId, bookingId: b.id, itemId: item.id,
      provider: item.source, operation: 'book', outcome: o, latencyMs: o === 'timeout' ? 30_000 : latencyMs,
      request: JSON.stringify({ offerId: item.offerId, from: item.from, to: item.to, pax: item.travellers.length, lead: `${item.travellers[0]?.lastName}` }),
      response, at: now,
    });
  };
  switch (outcome) {
    case 'confirm': log('confirmed', JSON.stringify({ status: 'CONFIRMED', confirmationNo: supplierRef })); return confirmItem(ctx, b, item, supplierRef, {}, SYSTEM(item.source));
    case 'reject': log('rejected', JSON.stringify({ status: 'FAILED', error: 'Rate no longer available at supplier' })); return rejectItem(ctx, b, item, 'Supplier declined the booking', SYSTEM(item.source));
    case 'pending': log('pending', JSON.stringify({ status: 'ON_REQUEST' })); return item;
    case 'timeout': log('timeout', JSON.stringify({ error: 'SUPPLIER_TIMEOUT after 30s' })); return item;
  }
}

/** Submit hook: live-API items are booked immediately (manual/network items wait for their supplier — W2 step 8). */
export function bookApiItems(ctx: RequestContext, b: BookingEntity, items: BookingItemEntity[]): void {
  for (const item of items) {
    const fresh = ctx.db.get('bookingItems', item.id)!;
    if (isApi(fresh) && fresh.status === 'pending' && fresh.holdReason === 'awaiting_supplier') bookWithAdapter(ctx, ctx.db.get('bookings', b.id)!, fresh);
  }
}

// ---- Clock job: BKG-7 auto-travelled ------------------------------------------------------------------------------
export function runTravelledJob(db: Database, clock: DemoClock): boolean {
  const today = clock.today();
  const now = clock.nowIso();
  const due = db.filter('bookingItems', (i) => (i.status === 'confirmed' || i.status === 'vouchered') && (i.to ?? i.from) < today);
  if (due.length === 0) return false;
  const touched = new Set<string>();
  for (const item of due) {
    if (!canTransition(item.status, 'travelled')) continue;
    db.replace('bookingItems', { ...item, status: 'travelled', updatedAt: now, version: item.version + 1 });
    db.insert('bookingEvents', {
      id: createId('bev', clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: item.tenantId, bookingId: item.bookingId, itemId: item.id,
      from: item.status, to: 'travelled', reason: 'Service date passed', actorUserId: null, actorName: 'System', at: now,
    });
    touched.add(item.bookingId);
  }
  for (const id of touched) {
    const b = db.get('bookings', id)!;
    const status = deriveBookingStatus(db.filter('bookingItems', (i) => i.bookingId === id).map((i) => i.status));
    if (status !== b.status) db.replace('bookings', { ...b, status, updatedAt: now, version: b.version + 1 });
  }
  return true;
}

// ---- Ops board ------------------------------------------------------------------------------------------------------
export function boardItem(ctx: RequestContext, p: Principal, b: BookingEntity, item: BookingItemEntity): BoardItem {
  const supplierView = p.org.type === 'supplier';
  return {
    bookingId: b.id, itemId: item.id, ref: b.ref, seq: item.seq, serviceType: item.serviceType, title: item.title, subtitle: item.subtitle,
    status: item.status, holdReason: item.status === 'pending' ? item.holdReason : null, source: item.source, ownership: item.ownership,
    supplierName: item.supplierName, sellerName: ctx.db.get('organizations', b.tenantId)?.name.en ?? '—', leadTraveller: b.leadTraveller,
    pax: item.travellers.length, from: item.from, to: item.to, createdAt: item.createdAt, supplierRef: item.supplierRef, voucherNo: item.voucherNo,
    overdueConfirmation: overdueConfirmation(ctx, item), actions: itemActions(ctx, p, b, item),
    amountMinor: supplierView ? item.breakdown.settlement.supplierPayoutMinor : item.breakdown.totals.customerTotalMinor, currency: b.currency,
  };
}

export function auditItem(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, action: string): void {
  audit(ctx, { tenantId: b.tenantId, action: `booking.item.${action}`, entity: 'bookingItem', entityId: item.id, after: { ref: b.ref, seq: item.seq, status: item.status } });
}
