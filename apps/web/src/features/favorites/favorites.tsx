'use client';

import { useQuery } from '@tanstack/react-query';
import type { FavoriteEntity, SearchResult } from '@travelta/schemas';
import { Heart, Search, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/components/api-provider';
import { ProductThumb } from '@/components/brand/product-thumb';
import { EmptyState } from '@/components/feedback/states';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

/** Signed-in storefront customers only; the list is shared by every heart on the page. */
export function useFavorites() {
  const api = useApi();
  const customer = useSession((s) => s.session?.user.userType === 'customer');
  const list = useQuery({ queryKey: ['favorites'], enabled: customer, queryFn: () => api.call('favorites.list') });
  const toggle = useAction((f: Pick<FavoriteEntity, 'key' | 'serviceType' | 'name' | 'destinationId' | 'destinationName' | 'imageSeed' | 'rating'>) => api.call('favorites.toggle', f), { invalidate: [['favorites']] });
  return { enabled: customer, keys: new Set((list.data ?? []).map((f) => f.key)), list, toggle };
}

export function FavoriteButton({ result }: { result: SearchResult }) {
  const t = useTranslations('favorites');
  const { enabled, keys, toggle } = useFavorites();
  if (!enabled) return null;
  const on = keys.has(result.key);
  return (
    <Button variant="ghost" size="icon" aria-pressed={on} aria-label={on ? t('remove', { name: result.name.en }) : t('add', { name: result.name.en })} data-testid="favorite-toggle"
      onClick={() => toggle.mutate({ key: result.key, serviceType: result.serviceType, name: result.name, destinationId: result.destinationId, destinationName: result.destinationName, imageSeed: result.imageSeed, rating: result.rating })}>
      <Heart className={cn(on ? 'fill-danger text-danger' : 'text-fg-muted')} aria-hidden />
    </Button>
  );
}

/** Account → Favorites: saved products; "Search" re-runs a fresh search for live prices. */
export function FavoritesPage() {
  const t = useTranslations('favorites');
  const locale = useLocale() as 'en' | 'ar';
  const { list, toggle } = useFavorites();
  const api = useApi();
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const codeOf = (id: string) => destinations.data?.items.find((d) => d.id === id)?.code;
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {!list.data ? <Skeleton className="h-40 w-full" /> : list.data.length === 0 ? (
        <EmptyState icon={<Heart aria-hidden />} title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="favorites-list">
          {list.data.map((f) => (
            <li key={f.id} className="overflow-hidden rounded-xl border border-border bg-surface">
              <ProductThumb serviceType={f.serviceType} seed={f.imageSeed} className="h-28 rounded-none" />
              <div className="flex flex-col gap-2 p-4">
                <p className="font-semibold text-fg">{f.name[locale]}</p>
                <p className="text-sm text-fg-muted">{f.destinationName[locale]} · ★ {f.rating.toFixed(1)}</p>
                <div className="flex gap-2">
                  {codeOf(f.destinationId) && (
                    <Link className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1')}
                      href={`/search?s=${encodeURIComponent(JSON.stringify({ serviceType: f.serviceType, destinationCode: codeOf(f.destinationId) }))}`}>
                      <Search aria-hidden />{t('checkPrices')}
                    </Link>
                  )}
                  <Button variant="ghost" size="sm" className="text-danger" aria-label={t('remove', { name: f.name[locale] })}
                    onClick={() => toggle.mutate({ key: f.key, serviceType: f.serviceType, name: f.name, destinationId: f.destinationId, destinationName: f.destinationName, imageSeed: f.imageSeed, rating: f.rating })}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
