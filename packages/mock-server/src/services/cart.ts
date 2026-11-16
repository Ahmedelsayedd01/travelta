import type { CartDto, CartEntity, CartItem, ManualItemInput, PriceBreakdown } from '@travelta/schemas';
import { manualItemInputSchema, QUOTE_TTL_MINUTES } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../context';
import { ApiException, forbidden, invalid, notFound } from '../errors';
import { requirePrincipal } from '../security';
import { projectBreakdown, quote } from './pricing';
import { offerDetail, viewerFor, type Viewer } from './search';

const MAX_ITEMS = 10;
const addMinutes = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString();

/** Carts belong to (user, seller). Agency staff need bookings.create; storefront customers always have a cart. */
export function cartViewer(ctx: RequestContext, storefront?: string): Viewer {
  const p = requirePrincipal(ctx);
  if (p.user.userType === 'staff' && !p.permissions.has('bookings.create')) throw forbidden('Missing permission: bookings.create');
  return viewerFor(ctx, { storefront });
}

export function loadCart(ctx: RequestContext, viewer: Viewer, storefront?: string): CartEntity {
  const p = requirePrincipal(ctx);
  const open = ctx.db.find('carts', (c) => c.userId === p.user.id && c.tenantId === viewer.sellerOrgId && c.status === 'open');
  if (open) return open;
  const now = ctx.clock.nowIso();
  return ctx.db.insert('carts', {
    id: createId('cart', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: viewer.sellerOrgId,
    userId: p.user.id, status: 'open', currency: viewer.currency, storefront: storefront ?? null, promoCode: null, items: [],
  });
}

export function saveCart(ctx: RequestContext, cart: CartEntity): CartEntity {
  const next = { ...cart, updatedAt: ctx.clock.nowIso(), version: cart.version + 1 };
  ctx.db.replace('carts', next);
  return next;
}

const buyOf = (b: PriceBreakdown, audience: Viewer['audience']): number | null =>
  audience === 'customer' ? null : audience === 'sub_agency' ? (b.buyPrices.subAgencyBuyMinor ?? b.buyPrices.agencyBuyMinor) : b.buyPrices.agencyBuyMinor;

export function cartDto(ctx: RequestContext, cart: CartEntity, viewer: Viewer): CartDto {
  const now = ctx.clock.nowIso();
  const items = cart.items.map((i) => ({
    ...i,
    breakdown: projectBreakdown(i.breakdown, viewer.audience),
    priceMinor: i.breakdown.totals.customerTotalMinor,
    taxMinor: i.breakdown.totals.taxMinor,
    buyMinor: buyOf(i.breakdown, viewer.audience),
    expired: i.expiresAt < now,
  }));
  const staff = viewer.audience !== 'customer';
  return {
    ...cart, items,
    totalMinor: items.reduce((a, i) => a + i.priceMinor, 0),
    discountMinor: cart.items.reduce((a, i) => a - i.breakdown.lines.filter((l) => l.key === 'discount').reduce((s, l) => s + l.amountMinor, 0), 0),
    costMinor: staff ? items.reduce((a, i) => a + (i.buyMinor ?? 0), 0) : null,
    audience: viewer.audience,
  };
}

/** Re-derive an offer item from its id (QTE-2). Returns null when it can no longer be sold. */
export function repriceOffer(ctx: RequestContext, item: CartItem, storefront?: string, promoCode?: string | null) {
  try {
    return offerDetail(ctx, item.offerId!, { storefront, customerType: item.customerType, channel: item.channel, nationalityIso2: item.nationalityIso2 ?? undefined, promoCode: promoCode ?? undefined });
  } catch (error) {
    if (error instanceof ApiException && (error.code === 'SOLD_OUT' || error.code === 'NOT_FOUND')) return null;
    throw error;
  }
}

export function addOfferItem(ctx: RequestContext, cart: CartEntity, input: { offerId: string; customerType: CartItem['customerType']; channel?: 'b2b' | 'b2c'; nationalityIso2?: string; storefront?: string }): CartEntity {
  if (cart.items.length >= MAX_ITEMS) throw invalid([{ field: 'offerId', issue: 'validation.cart_full' }], 'The cart holds up to 10 items');
  const r = offerDetail(ctx, input.offerId, { storefront: input.storefront, customerType: input.customerType, channel: input.channel, nationalityIso2: input.nationalityIso2, promoCode: cart.promoCode ?? undefined });
  const p = r.candidate.product;
  const dest = ctx.db.get('destinations', p.destinationId);
  const now = ctx.clock.nowIso();
  const item: CartItem = {
    id: createId('ci', ctx.clock.now()), kind: 'offer', serviceType: p.serviceType,
    title: p.name, subtitle: { en: `${r.unit.name.en}${dest ? ` · ${dest.name.en}` : ''}`, ar: `${r.unit.name.ar}${dest ? ` · ${dest.name.ar}` : ''}` },
    offerId: input.offerId, manual: null, source: r.candidate.source, ownership: r.candidate.ownership,
    from: r.built.travelDate, to: r.built.endDate === r.built.travelDate ? null : r.built.endDate,
    occupancy: { adults: r.key.adults, children: r.key.children, infants: r.key.infants, rooms: r.key.rooms },
    mealPlan: r.unit.mealPlan, times: r.unit.times, policy: r.unit.policy,
    customerType: input.customerType, channel: r.viewer.channel, nationalityIso2: input.nationalityIso2 ?? null,
    breakdown: r.full, quotedAt: now, expiresAt: addMinutes(now, QUOTE_TTL_MINUTES), previousPriceMinor: null, unavailable: false,
  };
  return saveCart(ctx, { ...cart, items: [...cart.items, item] });
}

/** Manual booking (W3): price a supplier cost through the engine with the user's markup for their own layer. */
export function priceManual(ctx: RequestContext, viewer: Viewer, raw: ManualItemInput): { breakdown: PriceBreakdown; supplierName: string; ownership: 'agency_own' | 'network'; supplierId: string } {
  const m = manualItemInputSchema.parse(raw);
  const p = requirePrincipal(ctx);
  if (viewer.audience === 'customer' || viewer.audience === 'platform') throw forbidden('Manual bookings are made by agencies');
  let supplierName: string;
  let ownership: 'agency_own' | 'network';
  if (m.supplier.kind === 'own') {
    const s = ctx.db.get('agencySuppliers', m.supplier.id);
    if (!s || s.tenantId !== p.org.id) throw notFound('Supplier');
    if (s.status !== 'active') throw invalid([{ field: 'supplier', issue: 'validation.supplier_inactive' }]);
    if (!s.serviceTypes.includes(m.serviceType)) throw invalid([{ field: 'serviceType', issue: 'validation.supplier_service' }]);
    supplierName = s.name; ownership = 'agency_own';
  } else {
    const org = ctx.db.get('organizations', m.supplier.id);
    if (!org || org.type !== 'supplier' || org.status !== 'active') throw notFound('Supplier');
    supplierName = org.name.en; ownership = 'network';
  }
  if (m.taxProfileId && !ctx.db.find('taxProfiles', (t) => t.id === m.taxProfileId && t.tenantId === viewer.sellerOrgId)) throw notFound('Tax profile');
  const { breakdown } = quote(ctx.db, ctx.clock, {
    serviceType: m.serviceType, source: 'manual', ownership, supplierId: m.supplier.id, destinationId: m.destinationId,
    customerType: m.customerType, channel: m.channel, currency: viewer.currency, travelDate: m.from, sellerOrgId: viewer.sellerOrgId,
    lines: [{ key: 'net', label: { en: m.title, ar: m.title }, unitType: 'booking', quantity: 1, netUnitMinor: m.netMinor, currency: m.netCurrency, taxProfileId: m.taxProfileId }],
    overrides: [{ layer: viewer.audience === 'sub_agency' ? 'sub_agent' : 'agency', mode: m.markup.mode, value: m.markup.value, by: p.user.id, reason: 'Manual booking markup' }],
  });
  return { breakdown, supplierName, ownership, supplierId: m.supplier.id };
}

export function addManualItem(ctx: RequestContext, cart: CartEntity, viewer: Viewer, raw: ManualItemInput): CartEntity {
  if (cart.items.length >= MAX_ITEMS) throw invalid([{ field: 'title', issue: 'validation.cart_full' }], 'The cart holds up to 10 items');
  const m = manualItemInputSchema.parse(raw);
  const priced = priceManual(ctx, viewer, m);
  const now = ctx.clock.nowIso();
  const item: CartItem = {
    id: createId('ci', ctx.clock.now()), kind: 'manual', serviceType: m.serviceType,
    title: { en: m.title, ar: m.title }, subtitle: { en: priced.supplierName, ar: priced.supplierName },
    offerId: null, manual: m, source: 'manual', ownership: priced.ownership, from: m.from, to: m.to, occupancy: m.occupancy,
    mealPlan: null, times: m.details.time ? [m.details.time] : [], policy: m.policy,
    customerType: m.customerType, channel: m.channel, nationalityIso2: null,
    breakdown: priced.breakdown, quotedAt: now, expiresAt: addMinutes(now, QUOTE_TTL_MINUTES), previousPriceMinor: null, unavailable: false,
  };
  return saveCart(ctx, { ...cart, items: [...cart.items, item] });
}

/** Recheck every item (QTE-2): refresh quotes, flag price changes (old vs new) and unavailable items. */
export function recheckCart(ctx: RequestContext, cart: CartEntity, viewer: Viewer, storefront?: string) {
  const now = ctx.clock.nowIso();
  const changes: { itemId: string; status: 'ok' | 'price_changed' | 'unavailable'; oldPriceMinor: number; newPriceMinor: number | null }[] = [];
  const items = cart.items.map((item): CartItem => {
    const old = item.breakdown.totals.customerTotalMinor;
    const fresh = item.kind === 'offer' ? repriceOffer(ctx, item, storefront, cart.promoCode)?.full ?? null : priceManual(ctx, viewer, item.manual!).breakdown;
    if (!fresh) {
      changes.push({ itemId: item.id, status: 'unavailable', oldPriceMinor: old, newPriceMinor: null });
      return { ...item, unavailable: true };
    }
    const next = fresh.totals.customerTotalMinor;
    changes.push({ itemId: item.id, status: next === old ? 'ok' : 'price_changed', oldPriceMinor: old, newPriceMinor: next });
    return { ...item, breakdown: fresh, quotedAt: now, expiresAt: addMinutes(now, QUOTE_TTL_MINUTES), previousPriceMinor: next === old ? item.previousPriceMinor : old, unavailable: false };
  });
  return { cart: saveCart(ctx, { ...cart, items }), changes };
}

/** Storefront promo codes (PRC promo): valid for the seller, active, in date and under its use limit; re-prices the cart. */
export function applyPromo(ctx: RequestContext, cart: CartEntity, viewer: Viewer, code: string | null, storefront?: string): CartEntity {
  const normalized = code?.trim().toUpperCase() || null;
  if (normalized) {
    const today = ctx.clock.today();
    const promo = ctx.db.find('promoCodes', (x) => x.tenantId === viewer.sellerOrgId && x.code === normalized);
    const ok = promo && promo.status === 'active' && promo.validFrom <= today && promo.validTo >= today && (promo.maxUses === null || promo.uses < promo.maxUses);
    if (!ok) throw invalid([{ field: 'code', issue: 'validation.promo_invalid' }], 'This code is not valid');
  }
  const withCode = { ...cart, promoCode: normalized };
  const { cart: repriced } = recheckCart(ctx, withCode, viewer, storefront);
  return saveCart(ctx, repriced);
}
