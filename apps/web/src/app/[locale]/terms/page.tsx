import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StoreShell } from '@/features/storefront/store-shell';
import { asLocale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'Booking terms' };

/** Plain-language booking terms (prototype). They describe the rules the platform actually enforces. */
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(asLocale(locale));
  const t = await getTranslations('terms');
  return (
    <StoreShell>
      <article className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
        <h1 className="text-3xl font-bold text-fg">{t('title')}</h1>
        <p className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">{t('demo')}</p>
        {[1, 2, 3, 4, 5].map((n) => (
          <section key={n}>
            <h2 className="text-lg font-semibold text-fg">{t(`h${n}` as never)}</h2>
            <p className="mt-1 text-fg-muted">{t(`p${n}` as never)}</p>
          </section>
        ))}
      </article>
    </StoreShell>
  );
}
