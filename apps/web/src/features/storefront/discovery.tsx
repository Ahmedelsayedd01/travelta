'use client';

import { useQuery } from '@tanstack/react-query';
import type { ServiceType } from '@travelta/contracts';
import { addDays, DESTINATION_IMAGES, SERVICE_IMAGES } from '@travelta/shared';
import { ArrowRight, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { MockApiGate, useApi } from '@/components/api-provider';
import { ProductThumb, TravelPhoto } from '@/components/brand/product-thumb';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoToday } from '@/features/demo/hooks';
import { defaultCriteria } from '@/features/search/search-form';
import { priceOf } from '@/features/search/format';
import { Link } from '@/i18n/navigation';

const searchHref = (serviceType: ServiceType, destinationCode: string, from?: string) =>
  `/search?s=${encodeURIComponent(JSON.stringify({ ...defaultCriteria(serviceType), destinationCode, ...(from ? { from, to: addDays(from, 3) } : {}) }))}`;

/** Popular destinations (reference data), each opening a live hotel search there. */
export function FeaturedDestinations() {
  return <MockApiGate fallback={<Skeleton className="mt-8 h-64 w-full rounded-xl" />}><Destinations /></MockApiGate>;
}

function Destinations() {
  const t = useTranslations('home');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const q = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  if (!q.data) return <Skeleton className="mt-8 h-64 w-full rounded-xl" />;
  const popular = q.data.items.filter((d) => d.popular && DESTINATION_IMAGES[d.code]).slice(0, 5);
  return (
    <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3" data-testid="featured-destinations">
      {popular.map((d, i) => (
        <li key={d.id} className={i === 0 ? 'col-span-2 md:col-span-1 md:row-span-2' : undefined}>
          <Link href={searchHref('hotel', d.code)} className="group relative flex h-full min-h-40 overflow-hidden rounded-xl focus-visible:outline-offset-4" data-destination={d.code}>
            <TravelPhoto image={DESTINATION_IMAGES[d.code]!} className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" decorative />
            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden />
            <span className="relative mt-auto flex w-full items-end justify-between gap-2 p-4 text-white">
              <span><span className="block text-lg font-semibold">{d.name[locale]}</span><span className="text-sm opacity-90">{t('exploreStays')}</span></span>
              <ArrowRight className="flip-rtl size-5 shrink-0" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A live "popular" row: top-rated results for one service in one destination (real search, real prices). */
export function PopularRow({ serviceType, destinationCode, title }: { serviceType: ServiceType; destinationCode: string; title: string }) {
  return (
    <section className="mt-12" aria-label={title}>
      <MockApiGate fallback={<Skeleton className="h-56 w-full rounded-xl" />}><Row serviceType={serviceType} destinationCode={destinationCode} title={title} /></MockApiGate>
    </section>
  );
}

function Row({ serviceType, destinationCode, title }: { serviceType: ServiceType; destinationCode: string; title: string }) {
  const t = useTranslations('home');
  const ts = useTranslations('search');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const today = useDemoToday();
  const from = addDays(today, 21);
  const dest = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const destinationId = dest.data?.items.find((d) => d.code === destinationCode)?.id;
  const q = useQuery({
    queryKey: ['search', 'popular', serviceType, destinationCode, from], enabled: Boolean(destinationId), staleTime: 300_000,
    queryFn: () => api.call('search.run', { serviceType, destinationId, from, to: serviceType === 'hotel' ? addDays(from, 3) : undefined, adults: 2, children: 0, infants: 0, sort: 'rating', pageSize: 4 }),
  });
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-semibold text-fg sm:text-2xl">{title}</h2>
        <Link href={searchHref(serviceType, destinationCode, from)} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">{t('seeAll')}<ArrowRight className="flip-rtl size-4" aria-hidden /></Link>
      </div>
      {!q.data ? <Skeleton className="mt-4 h-56 w-full rounded-xl" /> : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid={`popular-${serviceType}`}>
          {q.data.items.map((r, i) => (
            <li key={r.key}>
              <Link href={searchHref(serviceType, destinationCode, from)} className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs transition hover:shadow-md">
                <ProductThumb serviceType={r.serviceType} seed={r.imageSeed} image={SERVICE_IMAGES[r.serviceType][i % SERVICE_IMAGES[r.serviceType].length]} className="aspect-[4/3] w-full rounded-none" sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw" />
                <span className="flex flex-1 flex-col gap-1 p-4">
                  <span className="line-clamp-2 font-semibold text-fg">{r.name[locale]}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-fg-muted"><Star className="size-3.5 fill-highlight text-highlight" aria-hidden />{r.rating.toFixed(1)} · {ts('reviews', { count: r.reviews })}</span>
                  <span className="mt-auto pt-2 text-sm text-fg-muted">{ts('from')} <span className="tabular text-base font-bold text-fg">{priceOf(r.cheapest.priceMinor, r.cheapest.currency, locale)}</span></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

