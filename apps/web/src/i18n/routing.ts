import { defineRouting } from 'next-intl/routing';
import { LOCALES } from '@travelta/contracts';
import { defaultLocale, localeMeta } from '@travelta/i18n';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale,
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

export const localeDirection = (locale: Locale): 'ltr' | 'rtl' => localeMeta[locale].dir;

/** Route params arrive as plain strings; the [locale] layout already rejects unknown locales with notFound(). */
export function asLocale(value: string): Locale {
  return (routing.locales as readonly string[]).includes(value) ? (value as Locale) : routing.defaultLocale;
}
