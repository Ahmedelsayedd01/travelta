import { activeLocale } from './i18n';

const tag = activeLocale === 'ar' ? 'ar-EG' : 'en-EG';

/** Money in minor units → localized currency text (same rules as the web: amounts are integers in minor units). */
export const money = (minor: number, currency = 'EGP') => new Intl.NumberFormat(tag, { style: 'currency', currency }).format(minor / 100);
export const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const dayTime = (iso: string) => new Date(iso).toLocaleString(tag, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
