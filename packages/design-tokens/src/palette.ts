/**
 * Approved Travelta 2.0 palette (decision Q3, 15 Nov 2026) and derived scales.
 * Raw values live ONLY here. Components consume semantic tokens (./semantic.ts).
 */
export const palette = {
  teal: {
    50: '#F0FDFA', 100: '#CCFBF1', 200: '#99F6E4', 300: '#5EEAD4', 400: '#2DD4BF',
    500: '#14B8A6', // Accent — Turquoise
    600: '#0D9488',
    700: '#0F766E', // Primary — Deep Teal
    800: '#115E59', 900: '#134E4A',
  },
  navy: {
    50: '#F0F4F8', 100: '#D9E2EC', 200: '#BCCCDC', 300: '#9FB3C8', 400: '#829AB1',
    500: '#627D98', 600: '#486581', 700: '#334E68', 800: '#243B53',
    900: '#102A43', // Secondary — Dark Navy
    950: '#0A1628',
  },
  slate: {
    50: '#F8FAFC', // Background — Light Neutral
    100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8', 500: '#64748B',
    600: '#475569', 700: '#334155',
    800: '#1E293B', // Text — Dark Slate
    900: '#0F172A',
  },
  amber: { 100: '#FEF3C7', 400: '#FBBF24', 500: '#F59E0B' /* Highlight */, 700: '#B45309' },
  green: { 100: '#DCFCE7', 400: '#4ADE80', 700: '#15803D' },
  red: { 100: '#FEE2E2', 400: '#F87171', 700: '#B91C1C' },
  blue: { 100: '#DBEAFE', 400: '#60A5FA', 700: '#1D4ED8' },
  white: '#FFFFFF',
  night: { canvas: '#0B1220', surface: '#111A2E', raised: '#17223A', border: '#24324D' },
} as const;

export const brand = {
  primary: palette.teal[700],
  secondary: palette.navy[900],
  accent: palette.teal[500],
  background: palette.slate[50],
  surface: palette.white,
  highlight: palette.amber[500],
  text: palette.slate[800],
} as const;
