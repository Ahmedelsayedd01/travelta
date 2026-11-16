'use client';

import { useQuery } from '@tanstack/react-query';
import type { ServiceType } from '@travelta/contracts';
import { addDays } from '@travelta/shared';
import { ArrowRight, SearchX } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { create } from 'zustand';
import { useApi } from '@/components/api-provider';
import { EmptyState } from '@/components/feedback/states';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoToday } from '@/features/demo/hooks';
import { Link } from '@/i18n/navigation';
import { defaultCriteria } from '../search-form';
import { CategoryCard } from './cards';
import { CATEGORY_CONFIG } from './config';

/** The category currently selected in a search form on the page (shared by the form and the showcase). */
export const useSelectedCategory = create<{ service: ServiceType; set: (s: ServiceType) => void }>()((set) => ({ service: 'hotel', set: (service) => set({ service }) }));

/**
 * Cards for the selected category: its top-rated live results (mock `search.run`) in the category's showcase
 * destination, rendered with that category's card. Re-keyed per category for a short staggered entrance.
 */
export function CategoryShowcase({ service: fixed, base = '' }: { service?: ServiceType; base?: string }) {
  const selected = useSelectedCategory((s) => s.service);
  const service = fixed ?? selected;
  const t = useTranslations('showcase');
  const locale = useLocale();
  const api = useApi();
  const today = useDemoToday();
  const cfg = CATEGORY_CONFIG[service];
  const from = addDays(today, 21);
  const dest = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const destinationId = dest.data?.items.find((d) => d.code === cfg.showcaseDestination)?.id;
  const q = useQuery({
    queryKey: ['search', 'showcase', service, destinationId, from], enabled: Boolean(destinationId) || service === 'flight', staleTime: 300_000,
    queryFn: () => api.call('search.run', {
      serviceType: service, destinationId: service === 'flight' ? undefined : destinationId, from, to: service === 'hotel' ? addDays(from, 3) : undefined,
      fromCode: service === 'flight' ? 'CAI' : undefined, toCode: service === 'flight' ? cfg.showcaseDestination : undefined,
      adults: 2, children: 0, infants: 0, sort: 'rating', pageSize: 4,
    }),
  });
  const criteria = { ...defaultCriteria(service, today), destinationCode: cfg.showcaseDestination, ...(service === 'flight' ? { fromCode: 'CAI', toCode: cfg.showcaseDestination } : {}) };
  const href = `${base}/search?s=${encodeURIComponent(JSON.stringify(criteria))}`;
  const destName = dest.data?.items.find((d) => d.code === cfg.showcaseDestination)?.name;
  return (
    <section aria-live="polite" aria-busy={!q.data} data-testid="category-showcase" data-service={service}>
      <div key={service} className="tv-enter flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-fg sm:text-3xl" data-testid="showcase-title">{t(`title_${service}` as never)}</h2>
          <p className="mt-1 max-w-2xl text-fg-muted">{(t as unknown as (k: string, v: Record<string, string>) => string)(`body_${service}`, { place: (locale === "ar" ? destName?.ar : destName?.en) ?? cfg.showcaseDestination })}</p>
        </div>
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" data-testid="showcase-see-all">{t('seeAll')}<ArrowRight className="flip-rtl size-4" aria-hidden /></Link>
      </div>
      {/* Fixed min-height keeps the page from jumping while the next category loads. */}
      <div className="mt-6 min-h-[26rem]">
        {q.isError ? <EmptyState icon={<SearchX aria-hidden />} title={t('errorTitle')} body={t('errorBody')} />
          : !q.data ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[26rem] rounded-xl" />)}</div>
          : q.data.items.length === 0 ? <EmptyState icon={<SearchX aria-hidden />} title={t('emptyTitle')} body={t('emptyBody')} />
          : (
            <ul key={service} className="tv-enter-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="showcase-cards">
              {q.data.items.map((r, i) => <li key={r.key}><CategoryCard result={r} href={href} index={i} /></li>)}
            </ul>
          )}
      </div>
    </section>
  );
}
