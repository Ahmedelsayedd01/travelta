import { reloadAppAsync } from 'expo';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nManager } from 'react-native';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@travelta/contracts';
import { localeMeta, resources } from '@travelta/i18n';

/**
 * React Native applies layout direction at app start, so the active locale is derived from the native
 * RTL flag: switching language flips `forceRTL` and reloads the JS app (MOBILE_ARCHITECTURE §5).
 * On first launch the native flag follows the device language (supportsRTL is enabled in app.json).
 */
function initialLocale(): Locale {
  if (I18nManager.isRTL) return 'ar';
  const device = getLocales()[0]?.languageCode;
  return device === 'ar' ? 'ar' : 'en';
}

export const activeLocale: Locale = initialLocale();

export const i18next = createInstance();

void i18next
  .use(ICU)
  .use(initReactI18next)
  .init({
    lng: activeLocale,
    fallbackLng: 'en',
    // Same ICU JSON files as the web app; namespaces are top-level keys (`common.save`).
    resources: { en: { translation: resources.en }, ar: { translation: resources.ar } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export const isRtl = localeMeta[activeLocale].dir === 'rtl';

/** Change language: persist direction natively, then reload so every screen re-lays out. */
export async function switchLocale(next: Locale): Promise<void> {
  if (next === activeLocale) return;
  const rtl = localeMeta[next].dir === 'rtl';
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  await reloadAppAsync(`Switching language to ${next}`);
}

