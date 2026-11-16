import { describe, expect, it } from 'vitest';
import { boundsOf, distanceKm, inBounds, isValidGeo, nearest, scatterAround } from './geo';

const cairo = { lat: 30.0444, lng: 31.2357 };
const giza = { lat: 29.9792, lng: 31.1342 };

describe('geo', () => {
  it('validates coordinates (range, finite, not null island)', () => {
    expect(isValidGeo(cairo)).toBe(true);
    expect(isValidGeo({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidGeo({ lat: 10, lng: -181 })).toBe(false);
    expect(isValidGeo({ lat: Number.NaN, lng: 1 })).toBe(false);
    expect(isValidGeo({ lat: 0, lng: 0 })).toBe(false);
    expect(isValidGeo(null)).toBe(false);
  });

  it('measures great-circle distance', () => {
    expect(distanceKm(cairo, giza)).toBeCloseTo(12.2, 0);
    expect(distanceKm(cairo, cairo)).toBe(0);
    // Cairo → Makkah ≈ 1,285 km
    const km = distanceKm(cairo, { lat: 21.4225, lng: 39.8262 });
    expect(km).toBeGreaterThan(1270);
    expect(km).toBeLessThan(1300);
  });

  it('scatters deterministically within the radius', () => {
    const a = scatterAround(cairo, 'tbo:CAI:own:1', 4);
    expect(scatterAround(cairo, 'tbo:CAI:own:1', 4)).toEqual(a);
    expect(scatterAround(cairo, 'tbo:CAI:own:2', 4)).not.toEqual(a);
    for (let i = 0; i < 50; i++) expect(distanceKm(cairo, scatterAround(cairo, `k${i}`, 4))).toBeLessThanOrEqual(4.1);
  });

  it('orders places by distance and builds bounds', () => {
    const places = [{ id: 'g', geo: giza }, { id: 'c', geo: cairo }];
    expect(nearest(cairo, places).map((p) => p.id)).toEqual(['c', 'g']);
    const b = boundsOf([cairo, giza])!;
    expect(inBounds({ lat: 30, lng: 31.2 }, b)).toBe(true);
    expect(inBounds({ lat: 31, lng: 31.2 }, b)).toBe(false);
    expect(boundsOf([])).toBeNull();
  });
});
