import type { ApiErrorDetail } from '@travelta/contracts';
import { bookingRef, deriveBookingStatus } from '@travelta/domain';
import type {
  BookingDto, BookingEntity, BookingEventEntity, BookingItemEntity, BookingListItem, CartEntity, CartItem, CheckoutInput, PriceBreakdown, Traveller,
} from '@travelta/schemas';
import { checkoutInputSchema, PASSPORT_SERVICES } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../../context';
import { ApiException, invalid, notFound } from '../../errors';
import { requirePrincipal, type Principal } from '../../security';
import { audit } from '../audit';
import { priceManual, repriceOffer } from '../cart';
import { customerForUser, getCustomerScoped, saveCustomer } from '../customers';
import { authorizeCard, createPlan, recordAuthorization } from '../payments';
import { audienceOf, projectBreakdown, sellerChain, type Audience } from '../pricing';
import { itemActions } from './actions';
import { assertPlanLimit } from '../subscriptions';
import type { Viewer } from '../search';

// ---- Access scope (TENANCY §2) ---------------------------------------------------------------------------------
/** Platform: everything. Agency: own + sub-agency bookings (own only without view_all). Supplier: bookings with its items. Customer: their own. */
export function canSeeBooking(ctx: RequestContext, p: Principal, b: BookingEntity): boolean {
  if (p.user.userType === 'customer') return ctx.db.get('customers', b.customerId ?? '')?.userId === p.user.id;
  if (p.org.type === 'platform') return p.permissions.has('bookings.view');
  if (p.org.type === 'supplier') return p.permissions.has('bookings.view') && ctx.db.filter('bookingItems', (i) => i.bookingId === b.id && i.supplierOrgId === p.org.id).length > 0;
  if (!p.permissions.has('bookings.view')) return false;
  const mine = b.tenantId === p.org.id || ctx.db.get('organizations', b.tenantId)?.parentId === p.org.id;
  return mine && (p.permissions.has('bookings.view_all') || b.createdByUserId === p.user.id);
}

export function getBookingScoped(ctx: RequestContext, id: string): { booking: BookingEntity; principal: Principal } {
  const p = requirePrincipal(ctx);
  const booking = ctx.db.get('bookings', id);
  if (!booking || !canSeeBooking(ctx, p, booking)) throw notFound('Booking');
  return { booking, principal: p };
}

export function audienceFor(ctx: RequestContext, p: Principal, b: BookingEntity): Audience {
  const a = audienceOf(p.org, p.user.userType);
  // A parent agency looking at its sub-agency's booking sees it as the agency layer (it supplied the B2B price).
  if (a === 'agency' && b.tenantId !== p.org.id) return 'agency';
  return a;
}

/** Supplier view: only their payout (net − commission), never markups or the sell price. */
function supplierProjection(b: PriceBreakdown): PriceBreakdown {
  const payout = b.settlement.supplierPayoutMinor;
  return {
    ...b,
    lines: [{ key: 'net', owner: 'supplier', label: 'Supplier payout', amountMinor: payout, ruleId: null, ruleVersion: null, ruleName: null, basis: '', clamped: false, override: null }],
    units: b.units.map((u) => ({ ...u, sellMinor: 0, taxMinor: 0 })),
    totals: { netMinor: payout, preTaxMinor: payout, taxMinor: 0, customerTotalMinor: payout },
    settlement: { supplierPayoutMinor: payout, commissionMinor: b.settlement.commissionMinor, commissionBeneficiary: b.settlement.commissionBeneficiary, platformRevenueMinor: 0, agencyRevenueMinor: 0, subAgencyRevenueMinor: 0, taxPayableMinor: 0 },
    buyPrices: { agencyBuyMinor: 0, subAgencyBuyMinor: null },
    margins: { platformPct: 0, agencyPct: 0, subAgencyPct: null, grossProfitMinor: 0 },
  };
}

const costFor = (b: PriceBreakdown, audience: Audience): number | null =>
  audience === 'platform' ? b.totals.netMinor : audience === 'agency' ? b.buyPrices.agencyBuyMinor : audience === 'sub_agency' ? (b.buyPrices.subAgencyBuyMinor ?? b.buyPrices.agencyBuyMinor) : null;

const SLA_MS = 24 * 3600_000;
export const overdueConfirmation = (ctx: RequestContext, item: BookingItemEntity) =>
  item.status === 'pending' && item.holdReason === 'awaiting_supplier' && item.source !== 'tbo' && item.source !== 'hotelbeds'
  && ctx.clock.now() - Date.parse(item.createdAt) > SLA_MS;

export function bookingDto(ctx: RequestContext, p: Principal, b: BookingEntity): BookingDto {
  const audience = audienceFor(ctx, p, b);
  let items = ctx.db.filter('bookingItems', (i) => i.bookingId === b.id).sort((x, y) => x.seq - y.seq);
  if (audience === 'supplier') items = items.filter((i) => i.supplierOrgId === p.org.id);
  const users = (id: string | null) => (id ? ctx.db.get('users', id)?.name ?? '—' : '—');
  const supplierView = audience === 'supplier';
  return {
    ...b,
    // Suppliers never see the customer's money or contact; they see the travellers they serve.
    totals: supplierView ? { ...b.totals, sellMinor: 0, taxMinor: 0, agencyCostMinor: 0, paidMinor: 0, refundedMinor: 0 } : b.totals,
    notes: supplierView ? [] : b.notes,
    sellerName: ctx.db.get('organizations', b.tenantId)?.name.en ?? '—',
    customerName: supplierView ? null : b.customerId ? ctx.db.get('customers', b.customerId)?.name ?? null : null,
    createdByName: users(b.createdByUserId),
    items: items.map((i) => ({
      ...i,
      breakdown: supplierView ? supplierProjection(i.breakdown) : projectBreakdown(i.breakdown, audience),
      priceMinor: supplierView ? i.breakdown.settlement.supplierPayoutMinor : i.breakdown.totals.customerTotalMinor,
      taxMinor: supplierView ? 0 : i.breakdown.totals.taxMinor,
      costMinor: costFor(i.breakdown, audience),
      actions: itemActions(ctx, p, b, i),
    })),
    events: ctx.db.filter('bookingEvents', (e) => e.bookingId === b.id && (!supplierView || e.itemId === null || items.some((i) => i.id === e.itemId)))
      .sort((x, y) => x.at.localeCompare(y.at)),
    audience: audience as BookingDto['audience'],
    overdueConfirmation: items.some((i) => overdueConfirmation(ctx, i)),
  };
}

export function bookingListItem(ctx: RequestContext, p: Principal, b: BookingEntity): BookingListItem {
  let items = ctx.db.filter('bookingItems', (i) => i.bookingId === b.id).sort((x, y) => x.seq - y.seq);
  const supplierView = p.user.userType === 'staff' && p.org.type === 'supplier';
  if (supplierView) items = items.filter((i) => i.supplierOrgId === p.org.id);
  return {
    id: b.id, ref: b.ref, status: b.status, paymentStatus: b.paymentStatus, channel: b.channel,
    sellerName: ctx.db.get('organizations', b.tenantId)?.name.en ?? '—',
    customerName: supplierView ? null : b.customerId ? ctx.db.get('customers', b.customerId)?.name ?? null : null,
    leadTraveller: b.leadTraveller, services: [...new Set(items.map((i) => i.serviceType))], title: items[0]?.title ?? { en: b.ref, ar: b.ref },
    itemsCount: items.length, travelStart: b.travelStart, travelEnd: b.travelEnd, createdAt: b.createdAt, currency: b.currency,
    totalMinor: supplierView ? items.reduce((a, i) => a + i.breakdown.settlement.supplierPayoutMinor, 0) : b.totals.sellMinor,
    paidMinor: supplierView ? 0 : b.totals.paidMinor,
    holdReasons: [...new Set(items.flatMap((i) => (i.status === 'pending' && i.holdReason ? [i.holdReason] : [])))],
    overdueConfirmation: items.some((i) => overdueConfirmation(ctx, i)),
  };
}

// ---- Events & status ---------------------------------------------------------------------------------------------
export function logEvent(ctx: RequestContext, b: BookingEntity, itemId: string | null, from: string | null, to: string, reason: string | null, actor?: { id: string | null; name: string }): void {
  const now = ctx.clock.nowIso();
  const user = ctx.principal?.user;
  const row: BookingEventEntity = {
    id: createId('bev', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: b.tenantId, bookingId: b.id, itemId, from, to, reason,
    actorUserId: actor ? actor.id : user?.id ?? null, actorName: actor ? actor.name : user?.name ?? 'System', at: now,
  };
  ctx.db.insert('bookingEvents', row);
}

/** Re-derive and store the booking status from its items (BKG-2). */
export function refreshBookingStatus(ctx: RequestContext, bookingId: string): BookingEntity {
  const b = ctx.db.get('bookings', bookingId)!;
  const status = deriveBookingStatus(ctx.db.filter('bookingItems', (i) => i.bookingId === bookingId).map((i) => i.status));
  if (status === b.status) return b;
  const next = { ...b, status, updatedAt: ctx.clock.nowIso(), version: b.version + 1 };
  ctx.db.replace('bookings', next);
  logEvent(ctx, next, null, b.status, status, null);
  return next;
}

// ---- Travellers (W2 table) ---------------------------------------------------------------------------------------
const FEMALE = new Set(['mrs', 'ms', 'miss']);

export function validateTravellers(item: Pick<CartItem, 'serviceType' | 'occupancy' | 'times'>, travellers: Traveller[], details: { time?: string; documents?: unknown[] }, endDate: string, path: string): ApiErrorDetail[] {
  const issues: ApiErrorDetail[] = [];
  const count = (t: Traveller['type']) => travellers.filter((x) => x.type === t).length;
  const children = item.serviceType === 'hotel' ? item.occupancy.rooms.reduce((a, r) => a + r.childAges.length, 0) || item.occupancy.children : item.occupancy.children;
  const adults = item.serviceType === 'hotel' && item.occupancy.rooms.length ? item.occupancy.rooms.reduce((a, r) => a + r.adults, 0) : item.occupancy.adults;
  if (count('adult') !== adults || count('child') !== children || count('infant') !== (item.serviceType === 'hotel' ? 0 : item.occupancy.infants)) {
    issues.push({ field: `${path}.travellers`, issue: 'validation.traveller_count' });
  }
  if (travellers.filter((t) => t.lead).length !== 1) issues.push({ field: `${path}.travellers`, issue: 'validation.one_lead' });
  else if (travellers.find((t) => t.lead)!.type !== 'adult') issues.push({ field: `${path}.travellers`, issue: 'validation.lead_adult' });
  const passport = (PASSPORT_SERVICES as readonly string[]).includes(item.serviceType);
  travellers.forEach((t, j) => {
    const f = `${path}.travellers.${j}`;
    if (t.type !== 'adult' && !t.dateOfBirth) issues.push({ field: `${f}.dateOfBirth`, issue: 'validation.required' });
    if (passport) {
      if (!t.passportNo) issues.push({ field: `${f}.passportNo`, issue: 'validation.required' });
      if (!t.nationalityIso2) issues.push({ field: `${f}.nationalityIso2`, issue: 'validation.required' });
      if (!t.passportExpiry) issues.push({ field: `${f}.passportExpiry`, issue: 'validation.required' });
      else if (t.passportExpiry <= endDate) issues.push({ field: `${f}.passportExpiry`, issue: 'validation.passport_expired' });
    }
    if (item.serviceType === 'umrah' && FEMALE.has(t.title) && t.type === 'adult' && !t.mahram) issues.push({ field: `${f}.mahram`, issue: 'validation.mahram_required' });
  });
  if (item.times.length > 0 && (item.serviceType === 'activity' || item.serviceType === 'tour') && (!details.time || !item.times.includes(details.time))) {
    issues.push({ field: `${path}.details.time`, issue: 'validation.choose_time' });
  }
  if (item.serviceType === 'visa' && !(details.documents?.length)) issues.push({ field: `${path}.details.documents`, issue: 'validation.documents_required' });
  return issues;
}

// ---- Submit (W2 step 7) ------------------------------------------------------------------------------------------
export interface SubmitHooks {
  /** M15: wallet holds for network/API stock; returns item ids that must wait for credit approval (WAL-4). */
  placeHolds?: (ctx: RequestContext, booking: BookingEntity, items: BookingItemEntity[]) => Set<string>;
  /** M13: API items are booked through the adapter immediately. */
  afterSubmit?: (ctx: RequestContext, booking: BookingEntity, items: BookingItemEntity[]) => void;
}

export function submitCheckout(ctx: RequestContext, cart: CartEntity, viewer: Viewer, raw: CheckoutInput & { storefront?: string }, hooks: SubmitHooks = {}): BookingEntity {
  const p = requirePrincipal(ctx);
  const input = checkoutInputSchema.parse(raw);
  const replay = ctx.db.find('bookings', (b) => b.idempotencyKey === input.idempotencyKey && b.createdByUserId === p.user.id);
  if (replay) return replay;
  if (cart.items.length === 0) throw invalid([{ field: 'items', issue: 'validation.cart_empty' }], 'The cart is empty');
  const sellerOrg = ctx.db.get('organizations', viewer.sellerOrgId);
  if (sellerOrg) assertPlanLimit(ctx, sellerOrg, 'bookingsPerMonth');

  const byId = new Map(input.items.map((i) => [i.itemId, i]));
  const missing = cart.items.filter((i) => !byId.has(i.id));
  if (missing.length || input.items.length !== cart.items.length) throw invalid([{ field: 'items', issue: 'validation.cart_mismatch' }], 'Checkout does not match the cart');

  // 1. Recheck every item against the price the user accepted (QTE-2).
  const priced = cart.items.map((item) => {
    if (item.kind === 'offer') {
      const r = repriceOffer(ctx, item, raw.storefront, cart.promoCode);
      if (!r) throw new ApiException('SOLD_OUT', `${item.title.en} is no longer available`, [{ field: `items.${item.id}`, issue: 'errors.SOLD_OUT' }]);
      return { item, breakdown: r.full, consume: r.built.consume, productId: r.candidate.ownership === 'api' ? null : r.candidate.product.id, unitId: r.unit.id, supplierId: r.candidate.supplierId };
    }
    const m = priceManual(ctx, viewer, item.manual!);
    return { item, breakdown: m.breakdown, consume: [], productId: null, unitId: null, supplierId: m.supplierId };
  });
  const changed = priced.filter((x) => x.breakdown.totals.customerTotalMinor !== byId.get(x.item.id)!.acceptedPriceMinor);
  if (changed.length) {
    throw new ApiException('PRICE_CHANGED', 'Prices changed — review and accept the new total', changed.map((x) => ({ field: `items.${x.item.id}`, issue: 'errors.PRICE_CHANGED' })));
  }

  // 2. Travellers & per-service details.
  const issues = cart.items.flatMap((item, i) => {
    const sub = byId.get(item.id)!;
    return validateTravellers(item, sub.travellers, sub.details, item.to ?? item.from, `items.${i}`);
  });
  if (issues.length) throw invalid(issues, 'Traveller details are incomplete');

  // 3. Customer.
  let customerId: string | null;
  if (p.user.userType === 'customer') customerId = customerForUser(ctx, p).id;
  else if (input.newCustomer) customerId = saveCustomer(ctx, p, input.newCustomer, viewer.sellerOrgId).id;
  else if (input.customerId) customerId = getCustomerScoped(ctx, p, input.customerId).id;
  else throw invalid([{ field: 'customerId', issue: 'validation.customer_required' }], 'Choose or create a customer');

  // 4. Payment method fits the channel.
  if (p.user.userType === 'staff' && input.payment.method !== 'plan') throw invalid([{ field: 'payment.method', issue: 'validation.invalid_value' }]);
  if (p.user.userType === 'customer' && input.payment.method === 'plan') throw invalid([{ field: 'payment.method', issue: 'validation.invalid_value' }]);
  if (input.payment.method === 'pay_later') {
    const settings = ctx.db.find('commercialSettings', (s) => s.tenantId === viewer.sellerOrgId);
    if (!settings?.payLaterEnabled) throw invalid([{ field: 'payment.method', issue: 'validation.pay_later_disabled' }]);
  }

  // 5. Booking + items (pending; nothing consumed or charged until confirmation — BKG-3).
  const now = ctx.clock.nowIso();
  const today = ctx.clock.today();
  const chain = sellerChain(ctx.db, viewer.sellerOrgId);
  const seller = ctx.db.get('organizations', viewer.sellerOrgId)!;
  const allTravellers = input.items.flatMap((i) => i.travellers);
  const lead = allTravellers.find((t) => t.lead)!;
  const sum = (f: (b: PriceBreakdown) => number) => priced.reduce((a, x) => a + f(x.breakdown), 0);
  const upstream = (b: PriceBreakdown, own: boolean) => (own ? 0 : chain.subAgency ? (b.buyPrices.subAgencyBuyMinor ?? b.buyPrices.agencyBuyMinor) : b.buyPrices.agencyBuyMinor);
  const booking: BookingEntity = {
    id: createId('bkg', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: viewer.sellerOrgId,
    ref: bookingRef(today, ctx.db.nextSequence(`booking:${today.slice(0, 7)}`)),
    channel: p.user.userType === 'customer' ? 'b2c' : cart.items.every((i) => i.kind === 'manual') ? 'manual' : viewer.channel,
    agencyId: seller.isPlatformRetail ? null : chain.agency.id,
    createdByUserId: p.user.id, customerId, status: 'pending',
    paymentStatus: 'unpaid', paymentType: input.payment.method === 'plan' ? input.payment.type : input.payment.method === 'card' ? 'full' : 'later',
    currency: viewer.currency,
    fxSnapshot: priced.flatMap((x) => x.breakdown.fx).filter((f, i, a) => a.findIndex((g) => g.base === f.base && g.quote === f.quote) === i),
    totals: {
      sellMinor: sum((b) => b.totals.customerTotalMinor), taxMinor: sum((b) => b.totals.taxMinor), netMinor: sum((b) => b.totals.netMinor),
      agencyCostMinor: priced.reduce((a, x) => a + (seller.isPlatformRetail ? 0 : upstream(x.breakdown, x.item.ownership === 'agency_own')), 0),
      paidMinor: 0, refundedMinor: 0,
    },
    travelStart: cart.items.map((i) => i.from).sort()[0]!,
    travelEnd: cart.items.map((i) => i.to ?? i.from).sort().at(-1)!,
    leadTraveller: `${lead.firstName} ${lead.lastName}`,
    idempotencyKey: input.idempotencyKey, invoiceId: null,
    notes: input.notes ? [{ id: createId('note', ctx.clock.now()), at: now, userId: p.user.id, userName: p.user.name, text: input.notes }] : [],
  };

  // Card authorisation happens before anything is written so a decline leaves no trace (PAY-6).
  const auth = input.payment.method === 'card' ? authorizeCard(input.payment.card) : null;
  ctx.db.insert('bookings', booking);
  logEvent(ctx, booking, null, null, 'pending', 'Booking submitted');

  const items: BookingItemEntity[] = priced.map((x, i) => {
    const sub = byId.get(x.item.id)!;
    const supplierOrg = x.item.ownership === 'network' ? ctx.db.get('organizations', x.supplierId) : undefined;
    const ownSupplier = x.item.kind === 'manual' && x.item.manual!.supplier.kind === 'own' ? ctx.db.get('agencySuppliers', x.supplierId) : undefined;
    const productOwner = x.productId ? ctx.db.get('products', x.productId) : undefined;
    const row: BookingItemEntity = {
      id: createId('bki', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, bookingId: booking.id, tenantId: booking.tenantId, seq: i + 1,
      kind: x.item.kind, serviceType: x.item.serviceType, title: x.item.title, subtitle: x.item.subtitle, source: x.item.source, ownership: x.item.ownership,
      supplierOrgId: supplierOrg?.id ?? null,
      agencySupplierId: ownSupplier?.id ?? null,
      supplierName: supplierOrg?.name.en ?? ownSupplier?.name ?? (x.item.source === 'tbo' ? 'TBO Holidays' : x.item.source === 'hotelbeds' ? 'Hotelbeds' : ctx.db.get('organizations', productOwner?.ownerTenantId ?? '')?.name.en ?? x.item.subtitle.en),
      productId: x.productId, unitId: x.unitId, offerId: x.item.offerId, from: x.item.from, to: x.item.to, occupancy: x.item.occupancy, mealPlan: x.item.mealPlan,
      consume: x.consume, stockConsumed: false, travellers: sub.travellers, details: { ...(x.item.manual?.details ?? {}), ...sub.details },
      breakdown: x.breakdown, policy: x.item.policy, supplierRef: null, status: 'pending', holdReason: 'awaiting_supplier',
      voucherNo: null, confirmedAt: null, voucheredAt: null, cancelledAt: null, rejectReason: null,
    };
    ctx.db.insert('bookingItems', row);
    return row;
  });

  createPlan(ctx, booking, input.payment);
  if (auth) {
    recordAuthorization(ctx, booking, auth.last4);
    ctx.db.replace('bookings', { ...booking, paymentStatus: 'authorized' });
  }
  const waiting = hooks.placeHolds?.(ctx, ctx.db.get('bookings', booking.id)!, items) ?? new Set<string>();
  for (const item of items) {
    if (waiting.has(item.id)) ctx.db.replace('bookingItems', { ...item, holdReason: 'awaiting_credit_approval' });
  }
  ctx.db.replace('carts', { ...cart, status: 'checked_out', updatedAt: now, version: cart.version + 1 });
  if (cart.promoCode) {
    const promo = ctx.db.find('promoCodes', (x) => x.tenantId === booking.tenantId && x.code === cart.promoCode);
    if (promo) ctx.db.replace('promoCodes', { ...promo, uses: promo.uses + 1, updatedAt: now, version: promo.version + 1 });
  }
  audit(ctx, { tenantId: booking.tenantId, action: 'booking.created', entity: 'booking', entityId: booking.id, after: { ref: booking.ref, total: booking.totals.sellMinor } });
  hooks.afterSubmit?.(ctx, ctx.db.get('bookings', booking.id)!, ctx.db.filter('bookingItems', (i) => i.bookingId === booking.id));
  return ctx.db.get('bookings', booking.id)!;
}
