import { scatterAround } from '@travelta/domain';
import type { CurrencyCode, InventorySource, ServiceType, SupplierOwnership } from '@travelta/contracts';
import type { DestinationEntity, ProductDetails, ProductEntity, RateUnit, SearchParams } from '@travelta/schemas';
import { hashString } from '@travelta/shared';
import type { DemoClock } from '../../clock';
import type { Database } from '../../db/database';
import { rateOn } from '../fx';

/** A product a source can sell for a search, with its supply relationship (PRICING_ENGINE §2). */
export interface Candidate {
  product: ProductEntity;
  source: InventorySource;
  ownership: SupplierOwnership;
  supplierId: string;
  /** Merge key (INVT-4): the extranet product id for mapped API hotels, else the virtual product id. */
  mergeKey: string;
}

/**
 * The single adapter shape every supplier follows (proposal: search → recheck → book → cancel).
 * Search & recheck live here; book/cancel are added with bookings (Milestone 13).
 */
export interface SupplierAdapter {
  source: InventorySource;
  services: ServiceType[];
  candidates(db: Database, clock: DemoClock, params: SearchParams, sellerAgencyId: string): Candidate[];
  /** Re-derive one product from an offer's product key (recheck). */
  resolve(db: Database, clock: DemoClock, productKey: string, sellerAgencyId: string): Candidate | null;
}

const destOf = (db: Database, id: string | undefined) => (id ? db.get('destinations', id) : undefined);

function matchesDestination(db: Database, p: ProductEntity, params: SearchParams): boolean {
  if (params.serviceType === 'flight' && p.details.serviceType === 'flight') {
    const from = params.fromCode ?? 'CAI';
    const to = params.toCode ?? (destOf(db, params.destinationId)?.code ?? '');
    const airportOf: Record<string, string> = { JED: 'MKX' };
    return p.details.fromCode === from && (p.details.toCode === to || airportOf[p.details.toCode] === to);
  }
  return !params.destinationId || p.destinationId === params.destinationId;
}

/** Contracted stock: network suppliers (visible to every seller) and the seller agency's own products. */
export const extranetAdapter: SupplierAdapter = {
  source: 'extranet',
  services: ['hotel', 'flight', 'tour', 'visa', 'umrah', 'activity', 'transfer'],
  candidates(db, _clock, params, sellerAgencyId) {
    return db
      .filter('products', (p) => p.status === 'live' && p.serviceType === params.serviceType && matchesDestination(db, p, params))
      .flatMap((p) => {
        const c = this.resolve(db, _clock, p.id, sellerAgencyId);
        return c ? [c] : [];
      });
  },
  resolve(db, _clock, productKey, sellerAgencyId) {
    const p = db.get('products', productKey);
    if (!p || p.status !== 'live') return null;
    const owner = db.get('organizations', p.ownerTenantId);
    if (!owner || owner.status !== 'active') return null;
    if (owner.type === 'supplier') {
      if (!owner.serviceTypes.includes(p.serviceType)) return null;
      return { product: p, source: 'extranet', ownership: 'network', supplierId: owner.id, mergeKey: p.id };
    }
    // Agency-owned stock is only sold by that agency (and its sub-agencies, at the agency's B2B price).
    if (owner.id !== sellerAgencyId) return null;
    return { product: p, source: p.source, ownership: 'agency_own', supplierId: p.supplier.id, mergeKey: p.id };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Mock live APIs — deterministic, so the same search always returns the same offers (MOCK_DATA_ARCHITECTURE §5).
// ---------------------------------------------------------------------------------------------------------------

const L = (en: string, ar: string) => ({ en, ar });
const pct = (seed: number, min: number, max: number) => min + (seed % 1000) / 1000 * (max - min);
const POLICY_API = { nonRefundable: false, rules: [{ daysBefore: 3, feeType: 'percent' as const, value: 0 }, { daysBefore: 0, feeType: 'nights' as const, value: 1 }] };

function apiUnit(id: string, name: { en: string; ar: string }, netMinor: number, patch: Partial<RateUnit> = {}): RateUnit {
  return { id, name, baseNetMinor: netMinor, childNetMinor: Math.round(netMinor * 0.35), weekendUpliftPct: 8, defaultAllotment: 9, minStay: 1, policy: POLICY_API, mealPlan: null, maxAdults: 3, maxChildren: 2, times: [], weekdays: [], ...patch };
}

function virtual(id: string, owner: string, serviceType: ServiceType, source: InventorySource, name: { en: string; ar: string }, dest: DestinationEntity, currency: CurrencyCode, details: ProductDetails, units: RateUnit[], seed: number): ProductEntity {
  return {
    id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', version: 1, ownerTenantId: owner, serviceType, source,
    supplier: { kind: 'network', id: `${source}-api` }, name, description: L(`Live ${source.toUpperCase()} rate.`, `سعر مباشر من ${source.toUpperCase()}.`),
    destinationId: dest.id, currency, rating: Math.round((3.6 + pct(seed, 0, 1.3)) * 10) / 10, reviews: 40 + (seed % 2000), imageSeed: seed % 1000,
    status: 'live', details, units, seasons: [],
  };
}

const HOTEL_TEMPLATES: [string, string][] = [['Grand Palace', 'القصر الكبير'], ['Boutique Residence', 'ريزيدنس بوتيك'], ['Royal Hotel', 'الفندق الملكي'], ['Airport Suites', 'أجنحة المطار'], ['Oasis Resort', 'منتجع الواحة']];

interface ApiConfig {
  source: 'tbo' | 'hotelbeds';
  currency: CurrencyCode;
  /** Net factor range versus mapped extranet rates, and how many own (unmapped) hotels per destination. */
  factor: [number, number];
  ownHotels: number;
  mapShare: number;
}

function apiHotels(db: Database, clock: DemoClock, cfg: ApiConfig, dest: DestinationEntity): ProductEntity[] {
  const owner = `${cfg.source}-api`;
  const toApi = (minor: number, from: CurrencyCode) => {
    const r = rateOn(db, from, cfg.currency, clock.today());
    return r ? Math.round(minor * r.rate) : minor;
  };
  const out: ProductEntity[] = [];
  // Mapped: a share of the network extranet hotels in this destination, same content, the API's own net rates.
  const mapped = db.filter('products', (p) => p.serviceType === 'hotel' && p.destinationId === dest.id && p.supplier.kind === 'network' && p.status === 'live')
    .filter((p) => (hashString(`${cfg.source}:${p.id}`) % 100) < cfg.mapShare * 100);
  for (const p of mapped) {
    const seed = hashString(`${cfg.source}:${p.id}`);
    const f = pct(seed, cfg.factor[0], cfg.factor[1]);
    out.push({
      ...p, id: `${cfg.source}:${dest.code}:map:${p.id}`, ownerTenantId: owner, source: cfg.source, supplier: { kind: 'network', id: owner }, currency: cfg.currency, seasons: [],
      units: p.units.slice(0, 2).map((u, i) => ({ ...u, id: `${cfg.source}-u${i}`, baseNetMinor: Math.round(toApi(u.baseNetMinor, p.currency) * f), childNetMinor: u.childNetMinor === null ? null : Math.round(toApi(u.childNetMinor, p.currency) * f), policy: POLICY_API })),
    });
  }
  for (let i = 0; i < cfg.ownHotels; i++) {
    const seed = hashString(`${cfg.source}:${dest.code}:${i}`);
    const [en, ar] = HOTEL_TEMPLATES[(seed >>> 4) % HOTEL_TEMPLATES.length]!;
    const stars = 3 + (seed % 3);
    const base = Math.round(pct(seed, 45, 230)) * 100;
    out.push(virtual(`${cfg.source}:${dest.code}:own:${i}`, owner, 'hotel', cfg.source, L(`${dest.name.en} ${en}`, `${ar} ${dest.name.ar}`), dest, cfg.currency,
      { serviceType: 'hotel', stars, address: dest.name.en, amenities: ['wifi', 'restaurant', ...(stars >= 4 ? ['pool', 'gym'] : [])], checkIn: '15:00', checkOut: '12:00', geo: scatterAround(dest.geo, `${cfg.source}:${dest.code}:own:${i}`, 4), neighborhood: null },
      [apiUnit(`${cfg.source}-u0`, L('Standard room · Room only', 'غرفة قياسية · بدون وجبات'), base, { mealPlan: 'RO' }),
        apiUnit(`${cfg.source}-u1`, L('Superior room · Breakfast', 'غرفة سوبيريور · مع الإفطار'), Math.round(base * 1.3), { mealPlan: 'BB', policy: { nonRefundable: true, rules: [] } })], seed));
  }
  return out;
}

/** Hotelbeds Activities & Transfers for destinations without contracted stock (Dubai, Istanbul, Makkah). */
const HB_ACTIVITIES: Record<string, [string, string, number, number][]> = {
  DXB: [['Desert Safari with BBQ Dinner', 'سفاري الصحراء مع عشاء شواء', 6, 6500], ['Burj Observation Deck', 'منصة مراقبة البرج', 1.5, 4800], ['Dhow Marina Dinner Cruise', 'عشاء على مركب الداو', 2, 5200]],
  IST: [['Bosphorus Sunset Cruise', 'رحلة البوسفور وقت الغروب', 2.5, 3600], ['Old City Walking Tour', 'جولة سيرًا في المدينة القديمة', 4, 4200], ['Turkish Bath Experience', 'تجربة الحمام التركي', 2, 5900]],
};
const HB_TRANSFERS: Record<string, [string, string, number][]> = {
  DXB: [['Dubai Airport → City hotels', 'مطار دبي ← فنادق المدينة', 3900]],
  IST: [['Istanbul Airport → Sultanahmet', 'مطار إسطنبول ← السلطان أحمد', 4500]],
  MKX: [['Jeddah Airport → Makkah hotels', 'مطار جدة ← فنادق مكة', 6800]],
  MED: [['Madinah Airport → Central Haram hotels', 'مطار المدينة ← فنادق الحرم', 3200]],
};
const TBO_FLIGHTS: [string, string, string, [string, string], string, string, number, number][] = [
  ['CAI', 'DXB', 'Atlas Sky', ['Dubai', 'دبي'], 'AS 902', '23:10', 220, 23000],
  ['CAI', 'JED', 'Crescent Jet', ['Jeddah', 'جدة'], 'CJ 451', '03:40', 140, 16500],
  ['CAI', 'IST', 'Atlas Sky', ['Istanbul', 'إسطنبول'], 'AS 618', '13:55', 160, 17900],
  ['CAI', 'RUH', 'Crescent Jet', ['Riyadh', 'الرياض'], 'CJ 207', '18:25', 170, 18800],
];

function makeApiAdapter(cfg: ApiConfig): SupplierAdapter {
  const generate = (db: Database, clock: DemoClock, serviceType: ServiceType, dest: DestinationEntity): ProductEntity[] => {
    if (serviceType === 'hotel') return apiHotels(db, clock, cfg, dest);
    const owner = `${cfg.source}-api`;
    if (cfg.source === 'hotelbeds' && serviceType === 'activity') {
      return (HB_ACTIVITIES[dest.code] ?? []).map(([en, ar, hours, net], i) => virtual(`hotelbeds:${dest.code}:act:${i}`, owner, 'activity', 'hotelbeds', L(en, ar), dest, 'EUR',
        { serviceType: 'activity', durationHours: hours, languages: ['en', 'ar'], highlights: [L('Instant confirmation', 'تأكيد فوري')], pickupPoints: ['Hotel lobby'], oldPriceMinor: null, tags: ['global'] },
        [apiUnit('hb-u0', L('Ticket', 'تذكرة'), net, { times: ['10:00', '15:00'], defaultAllotment: 40 })], hashString(`hb:act:${dest.code}:${i}`)));
    }
    if (cfg.source === 'hotelbeds' && serviceType === 'transfer') {
      return (HB_TRANSFERS[dest.code] ?? []).map(([en, ar, net], i) => virtual(`hotelbeds:${dest.code}:trf:${i}`, owner, 'transfer', 'hotelbeds', L(en, ar), dest, 'EUR',
        { serviceType: 'transfer', fromPlace: L(en.split(' → ')[0]!, ar.split(' ← ')[0]!), toPlace: L(en.split(' → ')[1]!, ar.split(' ← ')[1]!), durationMin: 45, mode: 'private' },
        [apiUnit('hb-u0', L('Private car · up to 3', 'سيارة خاصة · حتى 3'), net, { maxAdults: 3, defaultAllotment: 20 }), apiUnit('hb-u1', L('Minivan · up to 7', 'ميني فان · حتى 7'), Math.round(net * 1.5), { maxAdults: 7, defaultAllotment: 10 })], hashString(`hb:trf:${dest.code}:${i}`)));
    }
    if (cfg.source === 'tbo' && serviceType === 'flight') {
      return TBO_FLIGHTS.filter((f) => f[1] === dest.code || (f[1] === 'JED' && dest.code === 'MKX')).map(([from, to, carrier, toCity, no, depart, mins, fare], i) =>
        virtual(`tbo:${dest.code}:flt:${i}`, owner, 'flight', 'tbo', L(`Cairo → ${toCity[0]} · ${no}`, `القاهرة ← ${toCity[1]} · ${no}`), dest, 'USD',
          { serviceType: 'flight', carrier, flightNo: no, fromCode: from, toCode: to, fromCity: L('Cairo', 'القاهرة'), toCity: L(...toCity), departTime: depart, durationMin: mins, cabin: 'economy', baggageKg: 30 },
          [apiUnit('tbo-f0', L('Economy (TBO fare)', 'اقتصادية (سعر TBO)'), fare, { childNetMinor: Math.round(fare * 0.75), times: [depart], defaultAllotment: 40, policy: { nonRefundable: true, rules: [] } })], hashString(`tbo:flt:${no}`)));
    }
    return [];
  };
  const services: ServiceType[] = cfg.source === 'tbo' ? ['hotel', 'flight'] : ['hotel', 'activity', 'transfer'];
  return {
    source: cfg.source,
    services,
    candidates(db, clock, params) {
      if (!services.includes(params.serviceType)) return [];
      const dests = params.serviceType === 'flight'
        ? db.filter('destinations', (d) => d.code === (params.toCode === 'JED' ? 'MKX' : params.toCode) || d.id === params.destinationId)
        : params.destinationId ? [db.get('destinations', params.destinationId)].filter((d): d is DestinationEntity => Boolean(d)) : [];
      if (params.serviceType === 'flight' && (params.fromCode ?? 'CAI') !== 'CAI') return [];
      return dests.flatMap((d) => generate(db, clock, params.serviceType, d)).map((p) => ({
        product: p, source: cfg.source, ownership: 'api', supplierId: `${cfg.source}-api`, mergeKey: p.id.includes(':map:') ? p.id.split(':map:')[1]! : p.id,
      }));
    },
    resolve(db, clock, productKey) {
      const [source, code, kind] = productKey.split(':');
      if (source !== cfg.source || !code) return null;
      const dest = db.find('destinations', (d) => d.code === code);
      if (!dest) return null;
      const serviceType: ServiceType = kind === 'act' ? 'activity' : kind === 'trf' ? 'transfer' : kind === 'flt' ? 'flight' : 'hotel';
      const p = generate(db, clock, serviceType, dest).find((x) => x.id === productKey);
      return p ? { product: p, source: cfg.source, ownership: 'api', supplierId: `${cfg.source}-api`, mergeKey: p.id.includes(':map:') ? p.id.split(':map:')[1]! : p.id } : null;
    },
  };
}

export const tboAdapter = makeApiAdapter({ source: 'tbo', currency: 'USD', factor: [0.88, 1.02], ownHotels: 3, mapShare: 0.6 });
export const hotelbedsAdapter = makeApiAdapter({ source: 'hotelbeds', currency: 'EUR', factor: [0.92, 1.06], ownHotels: 2, mapShare: 0.5 });
export const ADAPTERS: SupplierAdapter[] = [extranetAdapter, tboAdapter, hotelbedsAdapter];

export function adapterFor(source: InventorySource): SupplierAdapter {
  return source === 'tbo' ? tboAdapter : source === 'hotelbeds' ? hotelbedsAdapter : extranetAdapter;
}

/** Deterministic simulated sell-out of API inventory for a date (some dates are full, like real suppliers). */
export function apiSoldOut(productKey: string, date: string): boolean {
  return hashString(`${productKey}|${date}`) % 23 === 0;
}
