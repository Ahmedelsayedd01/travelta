'use client';

import { useQuery } from '@tanstack/react-query';
import type { SearchResult } from '@travelta/schemas';
import { Check, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useApi } from '@/components/api-provider';
import { ProductThumb } from '@/components/brand/product-thumb';
import { ErrorState } from '@/components/feedback/states';
import { PriceBreakdownView } from '@/components/data/price-breakdown';
import { Badge } from '@/components/ui/badge';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { detailLine, policyLines, priceBasis, priceOf, SOURCE_GROUP } from './format';
import { HotelLocation } from './hotel-location';

interface OfferSheetProps {
  result: SearchResult | null;
  staff: boolean;
  context: { customerType?: 'individual' | 'corporate' | 'sub_agent' | 'vip'; channel?: 'b2b' | 'b2c'; storefront?: string; nationalityIso2?: string };
  onOpenChange: (open: boolean) => void;
  /** Rendered in the footer for the chosen offer (Add to cart — M12). */
  actions?: (offerId: string) => ReactNode;
}

/**
 * Options of one product across sources; choosing one re-derives it server-side (`search.offer`) and shows the
 * viewer's redacted price breakdown and the cancellation policy. The price shown is always the server's.
 */
export function OfferSheet({ result, staff, context, onOpenChange, actions }: OfferSheetProps) {
  const ts = useTranslations('search');
  const tc = useTranslations('catalog');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [picked, setPicked] = useState<string | null>(null);
  const offerId = result ? (picked && result.options.some((o) => o.offerId === picked) ? picked : result.cheapest.offerId) : null;
  const detail = useQuery({
    queryKey: ['search', 'offer', offerId, context],
    enabled: Boolean(offerId),
    queryFn: () => api.call('search.offer', { offerId: offerId!, ...context }),
    staleTime: 15_000,
  });

  return (
    <Sheet open={Boolean(result)} onOpenChange={(o) => { if (!o) setPicked(null); onOpenChange(o); }} size="lg"
      title={result?.name[locale] ?? ts('offerTitle')} description={result?.destinationName[locale]}
      footer={offerId && detail.data && actions ? actions(offerId) : undefined}>
      {result && (
        <div className="flex flex-col gap-6" data-testid="offer-sheet">
          <div className="flex gap-4">
            <ProductThumb serviceType={result.serviceType} seed={result.imageSeed} className="size-24 shrink-0" />
            <div className="min-w-0 text-sm text-fg-muted">
              <p className="line-clamp-3">{result.description[locale]}</p>
              <p className="mt-2 text-xs">{detailLine(result.details, ts as never, locale).filter(Boolean).join(' · ')}</p>
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-fg">{ts('chooseOption')}</legend>
            <div className="flex flex-col gap-2" role="radiogroup">
              {result.options.map((o) => {
                const on = o.offerId === offerId;
                return (
                  <button key={o.offerId} type="button" role="radio" aria-checked={on} onClick={() => setPicked(o.offerId)} data-testid="offer-option"
                    className={cn('flex items-center gap-3 rounded-lg border px-4 py-3 text-start transition-colors', on ? 'border-primary bg-primary-soft/40 ring-1 ring-primary' : 'border-border hover:bg-subtle')}>
                    <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-primary bg-primary text-on-primary' : 'border-border-strong')}>
                      {on && <Check className="size-3" strokeWidth={3} aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">{o.unitName[locale]}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {o.refundable ? <Badge tone="success">{ts('refundable')}</Badge> : <Badge>{ts('nonRefundable')}</Badge>}
                        {o.mealPlan && <Badge tone="info">{ts(`meal_${o.mealPlan}`)}</Badge>}
                        {staff && <Badge tone={SOURCE_GROUP(o) === 'groupGlobal' ? 'accent' : 'neutral'}>{ts(SOURCE_GROUP(o))}</Badge>}
                        {o.times.length > 0 && <span className="text-xs text-fg-muted">{ts('times')}: {o.times.join(', ')}</span>}
                      </span>
                    </span>
                    <span className="text-end">
                      <span className="tabular block font-semibold text-fg">{priceOf(o.priceMinor, o.currency, locale)}</span>
                      <span className="block text-xs text-fg-muted">{priceBasis(result, o, ts as never)}</span>
                      {staff && o.buyMinor !== null && <span className="tabular block text-xs text-fg-muted">{ts('yourCost')}: {priceOf(o.buyMinor, o.currency, locale)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {detail.isError ? (
            <ErrorState title={ts('offerGone')} body={errorMessage(detail.error)} onRetry={() => void detail.refetch()} />
          ) : !detail.data ? <Skeleton className="h-64 w-full" /> : (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-fg">{ts('cancellationPolicy')}</h3>
                <ul className="flex flex-col gap-1 rounded-lg border border-border bg-subtle/40 px-4 py-3 text-sm text-fg" data-testid="offer-policy">
                  {policyLines(detail.data.option.policy, ts as never, tc as never).map((l) => <li key={l}>{l}</li>)}
                </ul>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-fg">{ts('offerTitle')}</h3>
                <PriceBreakdownView breakdown={detail.data.breakdown} showSettlement={staff} />
              </section>
              <p className="flex items-center gap-2 text-xs text-fg-muted"><ShieldCheck className="size-4 text-success" aria-hidden />{ts('priceRecheck')}</p>
            </>
          )}
          {result.details.serviceType === 'hotel' && (
            <HotelLocation destinationId={result.destinationId} geo={result.geo} address={result.details.address} neighborhood={result.details.neighborhood} name={result.name[locale]} />
          )}
        </div>
      )}
    </Sheet>
  );
}
