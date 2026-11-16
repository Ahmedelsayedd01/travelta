'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ThemePreference = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'travelta:theme';

/** Runs before paint (inlined in <head>) so the stored theme applies without a flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

// External stores: the stored preference (localStorage + same-tab change event) and the OS colour scheme.
const PREF_EVENT = 'travelta:theme-change';
function subscribePreference(onChange: () => void) {
  window.addEventListener(PREF_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(PREF_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
const systemIsDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(subscribePreference, readStored, () => 'system' as const);
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false);

  const setPreference = useCallback((p: ThemePreference) => {
    try {
      if (p === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* storage unavailable: the attribute below still applies for this page */
    }
    if (p === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', p);
    window.dispatchEvent(new Event(PREF_EVENT));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved: preference === 'system' ? (systemDark ? 'dark' : 'light') : preference, setPreference }),
    [preference, systemDark, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('common');
  const { preference, setPreference } = useTheme();
  const options = [
    { value: 'light', label: t('lightTheme'), icon: Sun },
    { value: 'dark', label: t('darkTheme'), icon: Moon },
    { value: 'system', label: t('systemTheme'), icon: Monitor },
  ] as const;
  return (
    <div role="radiogroup" aria-label={t('theme')} className={cn('inline-flex rounded-md border border-border bg-surface p-0.5', className)}>
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          title={label}
          onClick={() => setPreference(value)}
          className={cn(
            'flex size-8 items-center justify-center rounded-sm text-fg-muted transition-colors hover:text-fg',
            preference === value && 'bg-primary-soft text-on-primary-soft',
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
