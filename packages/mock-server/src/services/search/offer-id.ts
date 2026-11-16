import type { InventorySource } from '@travelta/contracts';
import type { SearchParams } from '@travelta/schemas';

/**
 * Self-describing offer ids: everything needed to re-derive (recheck) the offer — source, product key, unit,
 * dates and occupancy. Cart, checkout and booking re-price from this id; the client never sends a price.
 */
export interface OfferKey {
  source: InventorySource;
  productKey: string;
  unitId: string;
  from: string;
  to: string | null;
  adults: number;
  children: number;
  infants: number;
  /** Hotel rooms: "2-5_8+1-" = room 1: 2 adults, children aged 5 & 8; room 2: 1 adult. */
  rooms: { adults: number; childAges: number[] }[];
}

const enc = (s: string) => encodeURIComponent(s).replace(/~/g, '%7E');

export function encodeOffer(k: OfferKey): string {
  const rooms = k.rooms.map((r) => `${r.adults}-${r.childAges.join('_')}`).join('+');
  return ['o1', k.source, enc(k.productKey), enc(k.unitId), k.from, k.to ?? '', `${k.adults}.${k.children}.${k.infants}`, rooms].join('~');
}

export function decodeOffer(id: string): OfferKey | null {
  const parts = id.split('~');
  if (parts.length !== 8 || parts[0] !== 'o1') return null;
  const [, source, productKey, unitId, from, to, pax, rooms] = parts as [string, string, string, string, string, string, string, string];
  const [adults, children, infants] = pax.split('.').map(Number) as [number, number, number];
  if (![adults, children, infants].every(Number.isInteger) || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  return {
    source: source as InventorySource, productKey: decodeURIComponent(productKey), unitId: decodeURIComponent(unitId), from, to: to || null,
    adults, children, infants,
    rooms: rooms ? rooms.split('+').map((r) => { const [a, c] = r.split('-'); return { adults: Number(a), childAges: c ? c.split('_').map(Number) : [] }; }) : [],
  };
}

export function paramsFromOffer(k: OfferKey, serviceType: SearchParams['serviceType']): SearchParams {
  return {
    serviceType, from: k.from, to: k.to ?? undefined, rooms: k.rooms.length ? k.rooms : undefined, adults: k.adults, children: k.children, infants: k.infants,
    customerType: 'individual', filters: {}, sort: 'price_asc', page: 1, pageSize: 12,
  };
}
