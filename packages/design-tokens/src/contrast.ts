/** WCAG 2.1 relative luminance & contrast ratio for #RRGGBB colours. */
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Expected #RRGGBB colour, got "${hex}"`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

/**
 * Pick a readable foreground for a brand colour chosen by an agency storefront.
 * Returns null when neither white nor dark slate reaches AA (the colour is rejected).
 */
export function readableOn(background: string, light = '#FFFFFF', dark = '#1E293B'): string | null {
  if (contrastRatio(light, background) >= AA_TEXT) return light;
  if (contrastRatio(dark, background) >= AA_TEXT) return dark;
  return null;
}
