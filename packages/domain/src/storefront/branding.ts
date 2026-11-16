/** WCAG 2.x relative luminance and contrast ratio for #RRGGBB colours. */
export function luminanceOf(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function contrastBetween(a: string, b: string): number {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
/** Storefront brand colours carry white text (buttons, hero), so each must reach AA 4.5:1 against white. */
export const AA_TEXT = 4.5;
export const brandColorReadable = (hex: string) => contrastBetween(hex, '#FFFFFF') >= AA_TEXT;

/** Host → storefront subdomain: `<sub>.travelta.app` in production, `<sub>.localhost` in the prototype. */
export function subdomainOf(host: string): string | null {
  const h = host.toLowerCase().split(':')[0]!;
  const m = /^([a-z0-9-]{3,40})\.(travelta\.app|localhost)$/.exec(h);
  return m && m[1] !== 'www' ? m[1]! : null;
}
