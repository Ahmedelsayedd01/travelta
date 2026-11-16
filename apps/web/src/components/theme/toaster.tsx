'use client';

import { useLocale } from 'next-intl';
import { Toaster as Sonner } from 'sonner';
import { localeMeta } from '@travelta/i18n';
import type { Locale } from '@/i18n/routing';
import { useTheme } from './theme';

export function Toaster() {
  const { resolved } = useTheme();
  const locale = useLocale() as Locale;
  const dir = localeMeta[locale].dir;
  return (
    <Sonner
      theme={resolved}
      dir={dir}
      position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
      richColors
      closeButton
      // Keep toasts clear of the floating Demo tools button (same corner).
      offset={{ bottom: 72 }}
      mobileOffset={{ bottom: 72 }}
      toastOptions={{ className: 'font-sans' }}
    />
  );
}
