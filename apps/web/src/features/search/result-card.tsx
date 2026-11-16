'use client';

import type { SearchOutput, SearchResult } from '@travelta/schemas';
import { Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { ProductThumb } from '@/components/brand/product-thumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { FavoriteButton } from '@/features/favorites/favorites';
import { priceBasis, priceOf, SOURCE_GROUP } from './format';
import { CategoryFacts } from './categories/cards';

/**
 * One product in the results — merged across every source that sells it, headline = the cheapest option.
 * Layout follows the width of the results column (`@container`), not the viewport, so it also fits the list + map split.
 */
export function ResultCard({ result: r, audience, onOpen, selected, onHover, onSelect }: {
  result: SearchResult; audience: SearchOutput['audience']; onOpen: () => void;
  /** Map link (hotels): highlighted when its marker is selected; hovering/clicking the card highlights the marker. */
  selected?: boolean; onHover?: (key: string | null) => void; onSelect?: (key: string) => void;
}) {
  const ts = useTranslations('search');
  const tm = useTranslations('maps');
  const locale = useLocale() as 'en' | 'ar';
  const o = r.cheapest;
  const staff = audience !== 'customer';
  const groups = [...new Set(r.options.map(SOURCE_GROUP))];
  return (
    <article className={cn('group grid scroll-mt-24 overflow-hidden rounded-xl border bg-surface shadow-xs transition-shadow hover:shadow-md @xl:grid-cols-[12rem_minmax(0,1fr)_auto]', selected ? 'border-primary ring-2 ring-primary' : 'border-border')}
      data-testid="search-result" data-key={r.key} data-selected={selected ? 'true' : undefined}
      onMouseEnter={onHover ? () => onHover(r.key) : undefined} onMouseLeave={onHover ? () => onHover(null) : undefined}
      onClick={onSelect ? (e) => { if (!(e.target as HTMLElement).closest('button, a')) onSelect(r.key); } : undefined}>
      <ProductThumb serviceType={r.serviceType} seed={r.imageSeed} className="h-36 rounded-none @xl:h-full" />
      <div className="flex min-w-0 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {r.stars !== null && (
            <span className="flex items-center gap-0.5 text-highlight" role="img" aria-label={tm('stars', { n: r.stars })}>
              {Array.from({ length: r.stars }, (_, i) => <Star key={i} className="size-3.5 fill-current" aria-hidden />)}
            </span>
          )}
          <span className="text-xs text-fg-muted">{r.destinationName[locale]}</span>
          {r.distanceKm !== null && <span className="text-xs text-fg-muted" data-testid="result-distance">· {tm('kmFromCentre', { km: r.distanceKm })}</span>}
          {onSelect && r.geo && (
            <button type="button" className="text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={() => onSelect(r.key)} aria-pressed={selected} data-testid="show-on-map">{tm('showOnMap')}</button>
          )}
        </div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-snug text-fg">{r.name[locale]}</h3>
          <FavoriteButton result={r} />
        </div>
        <CategoryFacts r={r} />
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <Badge tone="primary"><span className="tabular">{r.rating.toFixed(1)}</span></Badge>
          <span className="text-xs text-fg-muted">{ts('reviews', { count: r.reviews })}</span>
          {o.refundable ? <Badge tone="success">{ts('refundable')}</Badge> : <Badge tone="neutral">{ts('nonRefundable')}</Badge>}
          {o.mealPlan && <Badge tone="info">{ts(`meal_${o.mealPlan}`)}</Badge>}
          {staff && groups.map((g) => <Badge key={g} tone={g === 'groupGlobal' ? 'accent' : g === 'groupExtranet' ? 'highlight' : 'neutral'}>{ts(g)}</Badge>)}
          {r.sources.length > 1 && <span className="text-xs text-fg-muted">{ts('sameProductSources', { count: r.sources.length })}</span>}
        </div>
      </div>
      <div className="flex flex-row items-end justify-between gap-3 border-t border-border p-4 @xl:min-w-48 @xl:flex-col @xl:border-s @xl:border-t-0">
        <div className="text-start @xl:text-end">
          <p className="text-xs text-fg-muted">{ts('from')}</p>
          <p className="tabular text-xl font-bold text-fg" data-testid="result-price">{priceOf(o.priceMinor, o.currency, locale)}</p>
          <p className="text-xs text-fg-muted">{priceBasis(r, o, ts as never)}</p>
          {staff && o.buyMinor !== null && (
            <p className="tabular mt-1 text-xs text-fg-muted" data-testid="result-cost">
              {ts('yourCost')}: <span className="font-medium text-fg">{priceOf(o.buyMinor, o.currency, locale)}</span>
              {' · '}{ts('yourMargin')}: <span className="font-medium text-success">{priceOf(o.marginMinor ?? 0, o.currency, locale)}</span>
            </p>
          )}
          {o.available <= 5 && <p className="mt-1 text-xs font-medium text-warning">{ts('available', { count: o.available })}</p>}
        </div>
        <Button onClick={onOpen} data-testid="open-offer">{r.options.length > 1 ? ts('viewOptions') : ts('select')}</Button>
      </div>
    </article>
  );
}
