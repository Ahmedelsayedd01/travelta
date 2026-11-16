import { describe, expect, it } from 'vitest';
import { DESTINATION_IMAGES, imageForProduct, SERVICE_IMAGES, TRAVEL_IMAGES } from './travel-images';

describe('travel image catalogue', () => {
  it('every photo has bilingual alt text and a free licence with author and source', () => {
    for (const [k, img] of Object.entries(TRAVEL_IMAGES)) {
      expect(img.alt.en.length, k).toBeGreaterThan(10);
      expect(img.alt.ar.length, k).toBeGreaterThan(5);
      expect(img.credit.license, k).toMatch(/^(CC0|Public domain|CC BY(-SA)? \d\.\d)$/);
      expect(img.credit.source, k).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
  });

  it('services only use their own photos and never share one', () => {
    const all = Object.values(SERVICE_IMAGES).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const [service, keys] of Object.entries(SERVICE_IMAGES)) {
      for (const k of keys) expect(k.startsWith(service === 'transfer' ? 'transfer' : service), `${service} → ${k}`).toBe(true);
      for (let seed = 0; seed < 20; seed++) expect(keys).toContain(imageForProduct(service as keyof typeof SERVICE_IMAGES, seed));
    }
    expect(Object.keys(DESTINATION_IMAGES)).toHaveLength(12);
  });
});
