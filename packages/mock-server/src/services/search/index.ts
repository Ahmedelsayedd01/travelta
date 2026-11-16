import type { CurrencyCode } from '@travelta/contracts';
import { checkDate, distanceKm, inBounds, scatterAround, checkStay, dayAvailability, netOn, overridesIndex, type OverrideLookup } from '@travelta/domain';
import type { NetLine, OfferDetail, OfferOption, PriceBreakdown, ProductEntity, RateUnit, SearchOutput, SearchParams, SearchResult } from '@travelta/schemas';
import { addDays, diffDays, eachDate } from '@travelta/shared';
import type { RequestContext } from '../../context';
import { resolveStorefront } from '../storefront';
import { ApiException, forbidden } from '../../errors';
import { projectBreakdown, quote, sellerChain, type Audience } from '../pricing';
import { ADAPTERS, adapterFor, apiSoldOut, type Candidate } from './adapters';
import { decodeOffer, encodeOffer, type OfferKey } from './offer-id';

export interface Viewer {
  sellerOrgId: string;
  /** The agency layer for visibility of agency-owned stock (parent for sub-agencies). */
  sellerAgencyId: string;
  audience: Exclude<Audience, 'supplier'>;
  channel: 'b2b' | 'b2c';
  currency: CurrencyCode;
}

/** Who is searching decides the seller, the price layers shown and the redaction (PRC-6, TENANCY §4). */
export function viewerFor(ctx: RequestContext, opts: { storefront?: string; channel?: 'b2b' | 'b2c'; currency?: CurrencyCode }): Viewer {
  const p = ctx.principal;
  let sellerOrgId: string;
  let audience: Viewer['audience'];
  if (p && p.user.userType === 'staff') {
    if (p.org.type === 'supplier') throw forbidden('Suppliers do not search the sales catalog');
    if (p.org.type === 'platform') { sellerOrgId = ctx.db.find('organizations', (o) => o.isPlatformRetail)!.id; audience = 'platform'; }
    else { sellerOrgId = p.org.id; audience = p.org.parentId ? 'sub_agency' : 'agency'; }
  } else if (p) {
    sellerOrgId = p.org.id; audience = 'customer';
  } else {
    // Branded storefronts must be published, entitled and active (M22); omitted = Travelta Direct.
    const store = opts.storefront ? resolveStorefront(ctx.db, { slug: opts.storefront }).org : undefined;
    sellerOrgId = store?.id ?? ctx.db.find('organizations', (o) => o.isPlatformRetail)!.id;
    audience = 'customer';
  }
  const chain = sellerChain(ctx.db, sellerOrgId);
  const seller = ctx.db.get('organizations', sellerOrgId)!;
  return {
    sellerOrgId, sellerAgencyId: chain.agency.id, audience,
    channel: audience === 'customer' ? 'b2c' : (opts.channel ?? 'b2c'),
    currency: opts.currency ?? seller.baseCurrency,
  };
}

/** Stock a confirmed booking consumes: units per date (hotel room-nights, seats, vehicles). */
export interface Consumption { date: string; quantity: number }

interface Built { lines: NetLine[]; nights: number; quantity: number; available: number; travelDate: string; endDate: string; consume: Consumption[] }
interface Priced { option: OfferOption; breakdown: PriceBreakdown; full: PriceBreakdown; built: Built }

const totalPax = (k: { adults: number; children: number }) => k.adults + k.children;

/** Turn a candidate unit + request into net lines, quantity and availability (INVT-2/3) — per service. */
function netLines(c: Candidate, unit: RateUnit, k: OfferKey, lookup: OverrideLookup): Built | null {
  const p = c.product;
  const isApi = c.ownership === 'api';
  const line = (key: string, label: string, unitType: NetLine['unitType'], quantity: number, netUnitMinor: number): NetLine =>
    ({ key, label: { en: label, ar: label }, unitType, quantity, netUnitMinor, currency: p.currency });
  const available = (date: string, need: number) => {
    if (isApi) return apiSoldOut(p.id, date) ? 0 : unit.defaultAllotment;
    const r = checkDate(p, unit, date, need, lookup);
    return r.ok ? r.nights[0]!.available : 0;
  };
  const paxLines = (date: string): NetLine[] => {
    const base = netOn(p, unit, date, lookup(unit.id, date));
    const child = unit.childNetMinor ?? Math.round(base * 0.75);
    return [
      line('adults', 'Adults', 'pax', k.adults, base),
      ...(k.children > 0 ? [line('children', 'Children', 'pax', k.children, child)] : []),
      ...(k.infants > 0 ? [line('infants', 'Infants', 'ticket', k.infants, Math.round(base * 0.1))] : []),
    ];
  };

  switch (p.details.serviceType) {
    case 'hotel': {
      if (!k.to) return null;
      const rooms = k.rooms.length ? k.rooms : [{ adults: k.adults, childAges: [] }];
      if (unit.maxAdults !== null && rooms.some((r) => r.adults > unit.maxAdults! || r.childAges.length > (unit.maxChildren ?? 0))) return null;
      const nights = diffDays(k.from, k.to);
      if (nights < unit.minStay) return null;
      let avail: number;
      if (isApi) avail = eachDate(k.from, k.to).some((d) => apiSoldOut(p.id, d)) ? 0 : unit.defaultAllotment;
      else {
        const stay = checkStay(p, unit, k.from, k.to, rooms.length, lookup);
        avail = stay.ok ? Math.min(...stay.nights.map((n) => n.available)) : 0;
        if (!stay.ok && stay.reason !== 'sold_out') return null;
      }
      const children = rooms.reduce((a, r) => a + r.childAges.filter((age) => age >= 2).length, 0);
      const lines = eachDate(k.from, k.to).map((d) => line(`n${d}`, d, 'room_night', rooms.length, netOn(p, unit, d, lookup(unit.id, d))));
      if (children > 0 && unit.childNetMinor) lines.push(line('children', 'Children', 'pax', children * nights, unit.childNetMinor));
      return { lines, nights, quantity: rooms.length, available: avail, travelDate: k.from, endDate: k.to, consume: eachDate(k.from, k.to).map((date) => ({ date, quantity: rooms.length })) };
    }
    case 'umrah': {
      // Departures run on the unit's weekdays: the first one on/after the requested date (within 3 weeks).
      const depart = eachDate(k.from, addDays(k.from, 21)).find((d) => dayAvailability(p, unit, d, lookup).offered);
      if (!depart) return null;
      const nights = p.details.makkahNights + p.details.madinahNights;
      return { lines: paxLines(depart), nights, quantity: totalPax(k), available: available(depart, totalPax(k)), travelDate: depart, endDate: addDays(depart, nights), consume: [{ date: depart, quantity: totalPax(k) }] };
    }
    case 'transfer': {
      if (p.details.mode === 'private') {
        if (unit.maxAdults !== null && totalPax(k) > unit.maxAdults) return null;
        if (!isApi && !dayAvailability(p, unit, k.from, lookup).offered) return null;
        return { lines: [line('vehicle', 'Vehicle', 'vehicle', 1, netOn(p, unit, k.from, lookup(unit.id, k.from)))], nights: 0, quantity: 1, available: available(k.from, 1), travelDate: k.from, endDate: k.from, consume: [{ date: k.from, quantity: 1 }] };
      }
      return { lines: paxLines(k.from), nights: 0, quantity: totalPax(k), available: available(k.from, totalPax(k)), travelDate: k.from, endDate: k.from, consume: [{ date: k.from, quantity: totalPax(k) }] };
    }
    default: {
      // flight, tour, visa, activity: per person on the travel date.
      if (!isApi && !dayAvailability(p, unit, k.from, lookup).offered) return null;
      const nights = p.details.serviceType === 'tour' ? p.details.durationDays - 1 : 0;
      // Visas don't consume dated stock; tours/activities/flights take seats on the travel date.
      const consume = p.details.serviceType === 'visa' ? [] : [{ date: k.from, quantity: totalPax(k) }];
      return { lines: paxLines(k.from), nights, quantity: totalPax(k), available: available(k.from, totalPax(k)), travelDate: k.from, endDate: addDays(k.from, nights), consume };
    }
  }
}

function nationalityGroupOf(ctx: RequestContext, iso2?: string) {
  return iso2 ? ctx.db.find('nationalityGroups', (g) => g.countryIso2.includes(iso2))?.id ?? null : null;
}

const marginOf = (s: { platformRevenueMinor: number; agencyRevenueMinor: number; subAgencyRevenueMinor: number }, audience: Viewer['audience']): number | null =>
  audience === 'customer' ? null : audience === 'platform' ? s.platformRevenueMinor : audience === 'sub_agency' ? s.subAgencyRevenueMinor : s.agencyRevenueMinor;

function priceOption(ctx: RequestContext, c: Candidate, unit: RateUnit, k: OfferKey, viewer: Viewer, customerType: SearchParams['customerType'], nationalityIso2?: string, promoCode?: string): Priced | null {
  const lookup = c.ownership === 'api' ? () => undefined : overridesIndex(ctx.db.filter('calendarOverrides', (o) => o.productId === c.product.id && o.unitId === unit.id));
  const built = netLines(c, unit, k, lookup);
  if (!built) return null;
  const { breakdown } = quote(ctx.db, ctx.clock, {
    serviceType: c.product.serviceType, source: c.source, ownership: c.ownership, supplierId: c.supplierId,
    productId: c.mergeKey, destinationId: c.product.destinationId, nationalityGroupId: nationalityGroupOf(ctx, nationalityIso2),
    customerType, channel: viewer.channel, lines: built.lines, currency: viewer.currency, travelDate: built.travelDate, sellerOrgId: viewer.sellerOrgId, promoCode,
  });
  const shown = projectBreakdown(breakdown, viewer.audience);
  const buy = viewer.audience === 'customer' ? null : viewer.audience === 'sub_agency' ? breakdown.buyPrices.subAgencyBuyMinor : breakdown.buyPrices.agencyBuyMinor;
  return {
    breakdown: shown, full: breakdown, built,
    option: {
      offerId: encodeOffer({ ...k, source: c.source, productKey: c.product.id, unitId: unit.id }),
      source: c.source, ownership: c.ownership, unitName: unit.name, mealPlan: unit.mealPlan, refundable: !unit.policy.nonRefundable, policy: unit.policy,
      nights: built.nights, quantity: built.quantity, times: unit.times, priceMinor: breakdown.totals.customerTotalMinor, taxMinor: breakdown.totals.taxMinor,
      buyMinor: buy, marginMinor: marginOf(breakdown.settlement, viewer.audience), currency: viewer.currency, available: built.available, capacity: unit.maxAdults,
    },
  };
}

const SOURCE_GROUP = (o: OfferOption): 'extranet' | 'b2b' | 'global' => (o.ownership === 'api' ? 'global' : o.ownership === 'network' ? 'b2b' : 'extranet');

function toResult(ctx: RequestContext, c: Candidate, options: OfferOption[]): SearchResult {
  const p = c.product;
  const dest = ctx.db.get('destinations', p.destinationId);
  const geo = p.details.serviceType === 'hotel' ? (p.details.geo ?? (dest ? scatterAround(dest.geo, c.mergeKey, 3) : null)) : null;
  return {
    key: c.mergeKey, productId: c.ownership === 'api' ? null : p.id, serviceType: p.serviceType, name: p.name, description: p.description,
    destinationId: p.destinationId, destinationName: dest?.name ?? { en: '', ar: '' }, imageSeed: p.imageSeed, rating: p.rating, reviews: p.reviews,
    stars: p.details.serviceType === 'hotel' ? p.details.stars : null, details: p.details,
    sources: [...new Set(options.map((o) => o.source))], cheapest: options[0]!, options,
    geo, distanceKm: geo && dest ? distanceKm(dest.geo, geo) : null,
  };
}

/** search → (merge by mapping, cheapest first) → filter → sort → paginate (W2, INVT-4). */
export function runSearch(ctx: RequestContext, params: SearchParams): SearchOutput {
  const viewer = viewerFor(ctx, { storefront: params.storefront, channel: params.channel, currency: params.currency });
  const k: Omit<OfferKey, 'source' | 'productKey' | 'unitId'> = {
    from: params.from, to: params.to ?? null, adults: params.adults, children: params.children, infants: params.infants,
    rooms: params.serviceType === 'hotel' ? (params.rooms ?? [{ adults: params.adults, childAges: [] }]) : [],
  };
  const groups = new Map<string, { candidate: Candidate; options: OfferOption[] }>();
  const unavailableSources: SearchOutput['unavailableSources'] = [];
  for (const adapter of ADAPTERS) {
    if (!adapter.services.includes(params.serviceType)) continue;
    for (const c of adapter.candidates(ctx.db, ctx.clock, params, viewer.sellerAgencyId)) {
      for (const unit of c.product.units) {
        const priced = priceOption(ctx, c, unit, { ...k, source: c.source, productKey: c.product.id, unitId: unit.id }, viewer, params.customerType, params.nationalityIso2);
        if (!priced) continue;
        const g = groups.get(c.mergeKey) ?? { candidate: c, options: [] };
        // Prefer contracted (extranet) content as the display product when merging.
        if (c.ownership !== 'api' && g.candidate.ownership === 'api') g.candidate = c;
        g.options.push(priced.option);
        groups.set(c.mergeKey, g);
      }
    }
  }
  const f = params.filters;
  let results = [...groups.values()].flatMap(({ candidate, options }) => {
    const kept = options
      .filter((o) => o.available > 0)
      .filter((o) => !f.sources?.length || f.sources.includes(SOURCE_GROUP(o)))
      .filter((o) => !f.refundableOnly || o.refundable)
      .filter((o) => !f.mealPlans?.length || (o.mealPlan !== null && f.mealPlans.includes(o.mealPlan)))
      .filter((o) => f.maxPriceMinor === undefined || o.priceMinor <= f.maxPriceMinor)
      .sort((a, b) => a.priceMinor - b.priceMinor);
    return kept.length ? [toResult(ctx, candidate, kept)] : [];
  });
  if (f.bounds) results = results.filter((r) => r.geo !== null && inBounds(r.geo, f.bounds!));
  if (f.minStars) results = results.filter((r) => (r.stars ?? 5) >= f.minStars!);
  if (f.q?.trim()) { const q = f.q.trim().toLowerCase(); results = results.filter((r) => r.name.en.toLowerCase().includes(q) || r.name.ar.includes(f.q!.trim())); }
  const sorters: Record<SearchParams['sort'], (a: SearchResult, b: SearchResult) => number> = {
    price_asc: (a, b) => a.cheapest.priceMinor - b.cheapest.priceMinor,
    price_desc: (a, b) => b.cheapest.priceMinor - a.cheapest.priceMinor,
    rating: (a, b) => b.rating - a.rating,
    name: (a, b) => a.name.en.localeCompare(b.name.en),
    distance: (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
  };
  results.sort(sorters[params.sort]);
  const start = (params.page - 1) * params.pageSize;
  return {
    items: results.slice(start, start + params.pageSize), total: results.length, page: params.page, pageSize: params.pageSize,
    currency: viewer.currency, audience: viewer.audience, unavailableSources,
  };
}

/** Re-derive one offer from its id (recheck, QTE-2) with the redacted breakdown — used by details, cart and checkout. */
export interface OfferOpts { storefront?: string; customerType: SearchParams['customerType']; channel?: 'b2b' | 'b2c'; currency?: CurrencyCode; nationalityIso2?: string; promoCode?: string }
export type ResolvedOffer = OfferDetail & { candidate: Candidate; key: OfferKey; viewer: Viewer; unit: RateUnit; full: PriceBreakdown; built: Built };

export function offerDetail(ctx: RequestContext, offerId: string, opts: OfferOpts): ResolvedOffer {
  const key = decodeOffer(offerId);
  if (!key) throw new ApiException('VALIDATION_ERROR', 'Malformed offer id', [{ field: 'offerId', issue: 'validation.invalid_value' }]);
  const viewer = viewerFor(ctx, opts);
  const candidate = adapterFor(key.source).resolve(ctx.db, ctx.clock, key.productKey, viewer.sellerAgencyId);
  if (!candidate) throw new ApiException('SOLD_OUT', 'This product is no longer available');
  const unit = candidate.product.units.find((u) => u.id === key.unitId);
  if (!unit) throw new ApiException('SOLD_OUT', 'This option is no longer available');
  const priced = priceOption(ctx, candidate, unit, key, viewer, opts.customerType, opts.nationalityIso2, opts.promoCode);
  if (!priced || priced.option.available < 1) throw new ApiException('SOLD_OUT', 'No availability for these dates');
  return { result: toResult(ctx, candidate, [priced.option]), option: priced.option, breakdown: priced.breakdown, candidate, key, viewer, unit, full: priced.full, built: priced.built };
}

export type { ProductEntity };
