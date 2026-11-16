'use client';

import { useQuery } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, type ReactNode } from 'react';
import { useApi } from '@/components/api-provider';
import { EmptyState } from '@/components/feedback/states';
import { PageHeader } from '@/components/ui/page-header';
import { usePathname, useRouter } from '@/i18n/navigation';
import { defaultCriteria, SearchForm, toSearchInput, type SearchCriteria } from './search-form';
import { AddToCartButton } from '@/features/cart/add-to-cart';
import { SearchResults, type OfferActions } from './search-results';
import { CategoryShowcase, useSelectedCategory } from './categories/showcase';

/** Criteria live in the URL (`?s=`) so results survive navigation to the cart and back, and can be shared. */
function useCriteria(): [SearchCriteria | null, (c: SearchCriteria) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('s');
  const criteria = useMemo(() => {
    if (!raw) return null;
    try { return { ...defaultCriteria(), ...(JSON.parse(raw) as Partial<SearchCriteria>) }; } catch { return null; }
  }, [raw]);
  const set = (c: SearchCriteria) => router.replace(`${pathname}?s=${encodeURIComponent(JSON.stringify(c))}`, { scroll: false });
  return [criteria, set];
}

/** Agency "Search & book" (W2): one form for all seven services; results merged across every source. */
export function SearchExperience({ staff, storefront, offerActions, header }: {
  staff: boolean; storefront?: string; header?: ReactNode; offerActions?: OfferActions;
}) {
  const ts = useTranslations('search');
  const api = useApi();
  const [criteria, setCriteria] = useCriteria();
  const pathname = usePathname();
  const category = useSelectedCategory((s) => s.service);
  const setCategory = useSelectedCategory((s) => s.set);
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const input = criteria && destinations.data
    ? toSearchInput(criteria, destinations.data.items.find((d) => d.code === criteria.destinationCode)?.id, staff)
    : null;
  return (
    <div className="flex flex-col gap-6">
      {header}
      <SearchForm key={criteria ? JSON.stringify(criteria) : 'new'} initial={criteria ?? defaultCriteria(category)} staff={staff} onSearch={setCriteria} onServiceChange={setCategory} />
      {input ? <SearchResults key={JSON.stringify(input)} input={input} storefront={storefront} offerActions={offerActions} />
        : !criteria && (staff ? <EmptyState icon={<Compass aria-hidden />} title={ts('startTitle')} body={ts('startBody')} />
          : <CategoryShowcase base={pathname.replace(/\/search$/, '')} />)}
    </div>
  );
}

export function SearchPage() {
  const ts = useTranslations('search');
  return (
    <SearchExperience staff header={<PageHeader title={ts('title')} description={ts('description')} />}
      offerActions={(offerId, _result, input, close) => <AddToCartButton offerId={offerId} input={input} onAdded={close} cartHref="/agency/cart" />} />
  );
}
