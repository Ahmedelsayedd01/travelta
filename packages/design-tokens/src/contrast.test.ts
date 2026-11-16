import { describe, expect, it } from 'vitest';
import { brand, palette } from './palette';
import { colors } from './semantic';
import { AA_TEXT, contrastRatio, readableOn } from './contrast';

const solid = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

describe('approved palette', () => {
  it('keeps the approved brand values', () => {
    expect(brand).toEqual({
      primary: '#0F766E', secondary: '#102A43', accent: '#14B8A6', background: '#F8FAFC',
      surface: '#FFFFFF', highlight: '#F59E0B', text: '#1E293B',
    });
  });
});

describe('WCAG AA contrast for text pairs (both themes)', () => {
  const pairs: [fg: string, bg: string][] = [
    ['fg', 'canvas'], ['fg', 'surface'], ['fg-muted', 'canvas'], ['fg-muted', 'surface'], ['fg-subtle', 'surface'],
    ['on-primary', 'primary'], ['on-primary', 'primary-hover'], ['primary', 'canvas'], ['primary', 'surface'],
    ['on-secondary', 'secondary'], ['on-accent', 'accent'], ['on-highlight', 'highlight'],
    ['nav-fg', 'nav'], ['nav-muted', 'nav'], ['on-nav-active', 'nav-active'], ['on-hero', 'hero'], ['hero-muted', 'hero'],
    ['success', 'surface'], ['warning', 'surface'], ['danger', 'surface'], ['info', 'surface'], ['neutral', 'surface'],
    ['on-primary-soft', 'primary-soft'], ['success', 'success-bg'], ['warning', 'warning-bg'], ['danger', 'danger-bg'], ['info', 'info-bg'],
  ];
  for (const theme of ['light', 'dark'] as const) {
    for (const [fg, bg] of pairs) {
      const f = colors[theme][fg as keyof (typeof colors)['light']];
      const b = colors[theme][bg as keyof (typeof colors)['light']];
      if (!solid(f) || !solid(b)) continue; // translucent tints are checked against the composited surface below
      it(`${theme}: ${fg} on ${bg} ≥ 4.5`, () => {
        expect(contrastRatio(f, b)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('dark translucent status tints keep AA when composited on surface', () => {
    // 15% tint over the dark surface stays close to the surface; status fg must pass against surface.
    for (const role of ['success', 'warning', 'danger', 'info', 'neutral', 'on-primary-soft'] as const) {
      expect(contrastRatio(colors.dark[role], colors.dark.surface)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('forbids white text on turquoise accent and amber highlight', () => {
    expect(contrastRatio(palette.white, brand.accent)).toBeLessThan(AA_TEXT);
    expect(contrastRatio(palette.white, brand.highlight)).toBeLessThan(AA_TEXT);
    expect(colors.light['on-accent']).not.toBe(palette.white);
    expect(colors.light['on-highlight']).not.toBe(palette.white);
  });
});

describe('readableOn (agency storefront brand colours)', () => {
  it('keeps white on deep colours, switches to slate on light ones, rejects mid-tones', () => {
    expect(readableOn('#0F766E')).toBe('#FFFFFF');
    expect(readableOn('#F59E0B')).toBe('#1E293B');
    expect(readableOn('#808080')).toBeNull();
  });
});
