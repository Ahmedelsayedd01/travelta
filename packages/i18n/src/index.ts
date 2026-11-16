import type { Locale } from '@travelta/contracts';
import en from './locales/en.json';
import ar from './locales/ar.json';

/** ICU MessageFormat resources shared by next-intl (web) and i18next + i18next-icu (mobile). */
export type Messages = typeof en;
export const resources: Record<Locale, Messages> = { en, ar };
export const namespaces = Object.keys(en) as (keyof Messages)[];

export const defaultLocale: Locale = 'en';

export const localeMeta: Record<Locale, { dir: 'ltr' | 'rtl'; label: string; intl: string }> = {
  en: { dir: 'ltr', label: 'English', intl: 'en-US' },
  ar: { dir: 'rtl', label: 'العربية', intl: 'ar-EG-u-nu-latn' },
};

export const isRtl = (locale: Locale): boolean => localeMeta[locale].dir === 'rtl';
