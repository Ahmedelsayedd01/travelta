import { TRAVEL_IMAGES } from '@travelta/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StoreShell } from '@/features/storefront/store-shell';
import { asLocale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'Photo credits' };

/** Attribution for every travel photo (required by the CC BY / CC BY-SA licences). */
export default async function CreditsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(asLocale(locale));
  const t = await getTranslations('store');
  const loc = asLocale(locale) as 'en' | 'ar';
  return (
    <StoreShell>
      <div className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold text-fg">{t('photoCredits')}</h1>
        <p className="mt-2 text-fg-muted">{t('creditsBody')}</p>
        <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-surface" data-testid="credits-list">
          {Object.entries(TRAVEL_IMAGES).map(([key, img]) => (
            <li key={key} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <span className="font-medium text-fg">{img.alt[loc]}</span>
              <span className="text-fg-muted">
                <a href={img.credit.source} className="text-primary underline-offset-2 hover:underline" rel="noreferrer" target="_blank">{img.credit.author || '—'}</a>
                {' · '}{img.credit.licenseUrl ? <a href={img.credit.licenseUrl} className="hover:underline" rel="noreferrer license" target="_blank">{img.credit.license}</a> : img.credit.license}
                {' · Wikimedia Commons'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </StoreShell>
  );
}
