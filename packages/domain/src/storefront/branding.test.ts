import { describe, expect, it } from 'vitest';
import { brandColorReadable, contrastBetween, subdomainOf } from './branding';

describe('storefront branding (M22)', () => {
  it('computes WCAG contrast and enforces AA for white text', () => {
    expect(contrastBetween('#000000', '#FFFFFF')).toBe(21);
    expect(brandColorReadable('#0F766E')).toBe(true);
    expect(brandColorReadable('#FACC15')).toBe(false);
  });
  it('maps subdomains for travelta.app and localhost only', () => {
    expect(subdomainOf('nilehorizon.travelta.app')).toBe('nilehorizon');
    expect(subdomainOf('nilehorizon.localhost:3001')).toBe('nilehorizon');
    expect(subdomainOf('www.travelta.app')).toBeNull();
    expect(subdomainOf('localhost:3001')).toBeNull();
    expect(subdomainOf('evil.example.com')).toBeNull();
  });
});
