import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Providers } from '@/components/providers';
import { themeInitScript } from '@/components/theme/theme';
import { localeDirection, routing } from '@/i18n/routing';
import '../globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const arabic = IBM_Plex_Sans_Arabic({ variable: '--font-arabic', subsets: ['arabic'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'Travelta', template: '%s · Travelta' },
  description: 'Travelta 2.0 — B2B/B2C travel platform (prototype)',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={localeDirection(locale)} className={`${inter.variable} ${arabic.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">
        {/* Applies the stored theme before paint (no flash). next/script keeps it out of React's hydration tree. */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
