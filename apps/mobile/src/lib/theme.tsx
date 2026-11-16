import { colors, fontSize, fontWeight, nativeElevation, radii, spacing, type ColorScheme, type FontSizeKey } from '@travelta/design-tokens';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { isRtl } from './i18n';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface Theme {
  scheme: 'light' | 'dark';
  c: ColorScheme;
  space: typeof spacing;
  radii: typeof radii;
  elevation: typeof nativeElevation;
  font: (size: FontSizeKey, weight?: keyof typeof fontWeight) => { fontSize: number; lineHeight: number; fontWeight: (typeof fontWeight)[keyof typeof fontWeight] };
  rtl: boolean;
}

const ThemeContext = createContext<(Theme & { preference: ThemePreference; setPreference: (p: ThemePreference) => void }) | null>(null);

/** Arabic glyphs need extra line height for diacritics (DESIGN_SYSTEM §4). */
const lineBoost = isRtl ? 2 : 0;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  // Persisted with the rest of the device preferences in Milestone 3 (AsyncStorage).
  const [preference, setPreference] = useState<ThemePreference>('system');
  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({
      scheme,
      c: colors[scheme],
      space: spacing,
      radii,
      elevation: nativeElevation,
      font: (size: FontSizeKey, weight: keyof typeof fontWeight = 'regular') => ({
        fontSize: fontSize[size].size,
        lineHeight: fontSize[size].line + lineBoost,
        fontWeight: fontWeight[weight],
      }),
      rtl: isRtl,
      preference,
      setPreference,
    }),
    [scheme, preference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
