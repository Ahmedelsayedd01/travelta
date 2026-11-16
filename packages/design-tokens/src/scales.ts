/** Spacing scale (px / dp). 4px base. */
export const spacing = { 0: 0, 0.5: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const radii = { sm: 6, md: 8, lg: 12, xl: 16, full: 9999 } as const;

export const fontSize = {
  xs: { size: 12, line: 16 },
  sm: { size: 14, line: 20 },
  base: { size: 16, line: 24 },
  lg: { size: 18, line: 28 },
  xl: { size: 20, line: 28 },
  '2xl': { size: 24, line: 32 },
  '3xl': { size: 30, line: 36 },
  '4xl': { size: 36, line: 40 },
} as const;
export type FontSizeKey = keyof typeof fontSize;

export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;

/** Arabic body text gets extra line height for diacritics. */
export const arabicLineHeightBoost = 2;

export const fontFamily = {
  latin: 'Inter',
  arabic: 'IBM Plex Sans Arabic',
} as const;

export const shadows = {
  light: {
    xs: '0 1px 2px rgb(15 23 42 / 0.05)',
    sm: '0 1px 3px rgb(15 23 42 / 0.08), 0 1px 2px rgb(15 23 42 / 0.04)',
    md: '0 4px 12px rgb(15 23 42 / 0.08)',
    lg: '0 12px 32px rgb(15 23 42 / 0.12)',
  },
  dark: {
    xs: '0 1px 2px rgb(0 0 0 / 0.3)',
    sm: '0 1px 3px rgb(0 0 0 / 0.35)',
    md: '0 4px 12px rgb(0 0 0 / 0.4)',
    lg: '0 12px 32px rgb(0 0 0 / 0.5)',
  },
} as const;

/** React Native elevation equivalents. */
export const nativeElevation = {
  xs: { shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  sm: { shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  md: { shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  lg: { shadowOpacity: 0.12, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
} as const;

export const motion = { fast: 150, base: 200, slow: 250 } as const;

export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const;

export const controlHeight = { sm: 32, md: 40, lg: 48, touchMin: 44 } as const;
