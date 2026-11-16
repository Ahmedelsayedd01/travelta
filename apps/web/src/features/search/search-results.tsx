'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MEAL_PLANS, type SearchInput, type SearchResult } from '@travelta/schemas';
import { ChevronLeft, ChevronRight, CircleAlert, List, Map as MapIcon, PanelRight, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import type { MapBounds } from '@/components/map/map-view';
import { useApi } from '@/components/api-provider';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormSelect } from '@/components/form/form-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { useErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { HotelResultsMap } from './hotel-map';
import { OfferSheet } from './offer-sheet';
import { ResultCard } from './result-card';

type Filters = NonNullable<SearchInput['filters']>;
type Sort = NonNullable<SearchInput['sort']>;
const GROUPS = [['extranet', 'groupExtranet'], ['b2b', 'groupB2b'], ['global', 'groupGlobal']] as const;

/** Results with filters, sort and paging; the server does all filtering so totals and pages stay exact. */
export type OfferActions = (offerId: string, result: SearchResult, input: SearchInput, close: () => void) => ReactNode;

export function SearchResults({ input, storefront, offerActions }: { input: SearchInput; storefront?: string; offerActions?: OfferActions }) {
  const ts = useTranslations('search');
  const tc = useTranslations('common');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<Sort>('price_asc');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<SearchResult | null>(null);
  const query = { ...input, storefront, filters, sort, page, pageSize: 10 };
  const results = useQuery({ queryKey: ['search', 'run', query], queryFn: () => api.call('search.run', query), placeholderData: keepPreviousData, staleTime: 60_000 });
  const patch = (f: Partial<Filters>) => { setPage(1); setFilters((prev) => ({ ...prev, ...f })); };
  const data = results.data;
  const staff = data ? data.audience !== 'customer' : false;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hotel = input.serviceType === 'hotel';
  const tm = useTranslations('maps');
  // Map link (hotels): list ⇄ split ⇄ map; selection and hover are shared by cards and markers.
  const [view, setView] = useState<'list' | 'split' | 'map'>('list');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }), enabled: hotel, staleTime: 300_000 });
  const dest = destinations.data?.items.find((d) => d.id === input.destinationId);
  const selectFromMap = (key: string) => {
    setSelected(key);
    if (typeof document !== 'undefined') document.querySelector(`[data-testid=search-result][data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const [follow, setFollowState] = useState(false);
  const [lastBounds, setLastBounds] = useState<MapBounds | null>(null);
  // "Search as I move the map": the visible area becomes a server-side filter; other filters are kept.
  const setFollow = (on: boolean) => { setFollowState(on); patch({ bounds: on && lastBounds ? lastBounds : undefined }); };
  const onBounds = (b: MapBounds) => { setLastBounds(b); if (follow) patch({ bounds: b }); };
  const selectedResult = data?.items.find((r) => r.key === selected) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-5 self-start rounded-xl border border-border bg-surface p-4 lg:sticky lg:top-20" data-testid="search-filters">
        <Field label={ts('nameFilter')}>
          <Input type="search" name="q" value={filters.q ?? ''} onChange={(e) => patch({ q: e.target.value || undefined })} />
        </Field>
        {staff && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-fg">{ts('sourceGroups')}</legend>
            {GROUPS.map(([g, label]) => (
              <Checkbox key={g} label={ts(label)} checked={filters.sources?.includes(g) ?? false}
                onCheckedChange={(on) => {
                  const next = on ? [...(filters.sources ?? []), g] : (filters.sources ?? []).filter((x) => x !== g);
                  patch({ sources: next.length ? next : undefined });
                }} />
            ))}
          </fieldset>
        )}
        <Checkbox label={ts('refundableOnly')} checked={filters.refundableOnly ?? false} onCheckedChange={(on) => patch({ refundableOnly: on || undefined })} />
        {hotel && (
          <>
            <FormSelect label={ts('minStars')} name="minStars" value={filters.minStars ? String(filters.minStars) : ''}
              onValueChange={(v) => patch({ minStars: v ? Number(v) : undefined })}
              options={[{ value: '', label: ts('anyStars') }, ...[3, 4, 5].map((n) => ({ value: String(n), label: `${'★'.repeat(n)} ${tm('stars', { n })}` }))]} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-fg">{ts('mealPlans')}</legend>
              {MEAL_PLANS.map((m) => (
                <Checkbox key={m} label={ts(`meal_${m}`)} checked={filters.mealPlans?.includes(m) ?? false}
                  onCheckedChange={(on) => {
                    const next = on ? [...(filters.mealPlans ?? []), m] : (filters.mealPlans ?? []).filter((x) => x !== m);
                    patch({ mealPlans: next.length ? next : undefined });
                  }} />
              ))}
            </fieldset>
          </>
        )}
        {Object.keys(filters).some((k) => filters[k as keyof Filters] !== undefined) && (
          <Button variant="outline" size="sm" onClick={() => { setPage(1); setFilters({}); setFollowState(false); }}>{tc('clearFilters')}</Button>
        )}
      </aside>

      <section aria-live="polite" aria-busy={results.isFetching} className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-fg" data-testid="results-count">{data ? ts('resultsCount', { count: data.total }) : ts('searching')}</p>
          <FormSelect label={ts('sort')} className="w-52" name="sort" value={sort} onValueChange={(v) => { setPage(1); setSort(v as Sort); }}
            options={[{ value: 'price_asc', label: ts('sortPriceAsc') }, { value: 'price_desc', label: ts('sortPriceDesc') }, { value: 'rating', label: ts('sortRating') }, { value: 'name', label: ts('sortName') },
              ...(hotel ? [{ value: 'distance', label: tm('sortDistance') }] : [])]} />
          {hotel && (
            <div className="flex w-full items-center gap-1 rounded-lg border border-border bg-surface p-1 sm:w-auto" role="group" aria-label={tm('viewMode')} data-testid="view-toggle">
              {([['list', List, tm('viewList')], ['split', PanelRight, tm('viewSplit')], ['map', MapIcon, tm('viewMap')]] as const).map(([v, Icon, label]) => (
                <Button key={v} size="sm" variant={view === v ? 'primary' : 'ghost'} aria-pressed={view === v} onClick={() => setView(v)} data-testid={`view-${v}`}
                  className={cn('flex-1 sm:flex-none', v === 'split' && 'hidden lg:inline-flex')}>
                  <Icon aria-hidden />{v === 'map' ? <><span className="lg:hidden">{tm('showMap')}</span><span className="hidden lg:inline">{label}</span></> : label}
                </Button>
              ))}
            </div>
          )}
        </div>
        {data && data.unavailableSources.length > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">
            <CircleAlert className="size-4 shrink-0" aria-hidden />{ts('unavailableSources', { sources: data.unavailableSources.join(', ') })}
          </p>
        )}
        {/* The map stays mounted while results change (filters, "search as I move", empty areas): unmounting Leaflet
            mid-animation breaks it, and the map is what the user is interacting with. */}
        <div className={cn('grid gap-4', view === 'split' && hotel && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
          {(view !== 'map' || !data || results.isError) && (
            <div className={cn('@container flex min-w-0 flex-col gap-3 transition-opacity', results.isPlaceholderData && 'opacity-60')} data-testid="search-results">
              {results.isError ? <ErrorState body={errorMessage(results.error)} onRetry={() => void results.refetch()} />
                : !data ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
                : data.items.length === 0 ? <EmptyState icon={<SearchX aria-hidden />} title={ts('noResultsTitle')} body={ts('noResultsBody')} />
                : data.items.map((r) => <ResultCard key={r.key} result={r} audience={data.audience} onOpen={() => setOpen(r)}
                  {...(hotel ? { selected: r.key === selected, onHover: setHovered, onSelect: (k: string) => { setSelected(k); if (view === 'list') setView(window.matchMedia('(min-width: 1024px)').matches ? 'split' : 'map'); } } : {})} />)}
            </div>
          )}
          {data && hotel && view === 'split' && (
            <HotelResultsMap items={data.items} center={dest?.geo ?? data.items.find((r) => r.geo)?.geo ?? { lat: 30.0444, lng: 31.2357 }} zoom={dest?.zoom ?? 12}
              selected={selected} hovered={hovered} onSelect={selectFromMap} onHover={setHovered}
              followMap={follow} onFollowMap={(on) => setFollow(on)} onBounds={onBounds}
              className="hidden h-[calc(100vh-8rem)] min-h-96 lg:sticky lg:top-20 lg:block" />
          )}
        </div>
        {data && hotel && view === 'map' && !results.isError && (
          <div className="@container flex flex-col gap-3" data-testid="map-view">
            <HotelResultsMap items={data.items} center={dest?.geo ?? data.items.find((r) => r.geo)?.geo ?? { lat: 30.0444, lng: 31.2357 }} zoom={dest?.zoom ?? 12}
              selected={selected} hovered={hovered} onSelect={setSelected} onHover={setHovered}
              followMap={follow} onFollowMap={(on) => setFollow(on)} onBounds={onBounds} className="h-[65vh] min-h-80" />
            {selectedResult
              ? <ResultCard result={selectedResult} audience={data.audience} onOpen={() => setOpen(selectedResult)} selected />
              : <p className="text-center text-sm text-fg-muted">{tm(data.items.length ? 'tapMarker' : 'noHotelsHere')}</p>}
            <Button variant="outline" className="self-center" onClick={() => setView('list')} data-testid="back-to-list"><List aria-hidden />{tm('showList')}</Button>
          </div>
        )}
        {data && pages > 1 && (
          <nav className="flex items-center justify-center gap-3" aria-label={ts('pageOf', { page, pages })}>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="‹"><ChevronLeft className="flip-rtl" aria-hidden /></Button>
            <span className="tabular text-sm text-fg-muted">{ts('pageOf', { page, pages })}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="›"><ChevronRight className="flip-rtl" aria-hidden /></Button>
          </nav>
        )}
      </section>

      <OfferSheet result={open} staff={staff} onOpenChange={(o) => { if (!o) setOpen(null); }}
        context={{ customerType: input.customerType, channel: input.channel, storefront, nationalityIso2: input.nationalityIso2 }}
        actions={offerActions && open ? (id) => offerActions(id, open, input, () => setOpen(null)) : undefined} />
    </div>
  );
}
