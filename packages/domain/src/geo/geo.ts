/**
 * Geography helpers for maps and location-based discovery (hotel maps, nearby places, admin coordinate validation).
 * Pure functions: no map library, no network — the map provider lives in the apps behind an abstraction.
 */
export interface GeoPoint { lat: number; lng: number }

const EARTH_RADIUS_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function isValidGeo(p: { lat: unknown; lng: unknown } | null | undefined): p is GeoPoint {
  if (!p) return false;
  const { lat, lng } = p;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}

/** Great-circle distance in kilometres (haversine), rounded to 0.1 km. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
}

/**
 * Deterministic point near `center` for content without stored coordinates (mock API hotels):
 * the same key always lands on the same spot, within `radiusKm`.
 */
export function scatterAround(center: GeoPoint, key: string, radiusKm = 4): GeoPoint {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const angle = ((h % 3600) / 3600) * 2 * Math.PI;
  const dist = (0.15 + ((h >>> 12) % 1000) / 1000 * 0.85) * radiusKm;
  const dLat = (dist / 111.32) * Math.cos(angle);
  const dLng = (dist / (111.32 * Math.cos(rad(center.lat)))) * Math.sin(angle);
  return { lat: round6(center.lat + dLat), lng: round6(center.lng + dLng) };
}

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Places ordered by distance from `from`, nearest first, with the distance attached. */
export function nearest<T extends { geo: GeoPoint }>(from: GeoPoint, places: readonly T[], limit = 5): (T & { distanceKm: number })[] {
  return places.map((p) => ({ ...p, distanceKm: distanceKm(from, p.geo) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

/** Bounding box containing every point (null for none) — used to fit the map and to filter by viewport. */
export function boundsOf(points: readonly GeoPoint[]): { south: number; west: number; north: number; east: number } | null {
  if (points.length === 0) return null;
  return {
    south: Math.min(...points.map((p) => p.lat)), north: Math.max(...points.map((p) => p.lat)),
    west: Math.min(...points.map((p) => p.lng)), east: Math.max(...points.map((p) => p.lng)),
  };
}

export function inBounds(p: GeoPoint, b: { south: number; west: number; north: number; east: number }): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}
