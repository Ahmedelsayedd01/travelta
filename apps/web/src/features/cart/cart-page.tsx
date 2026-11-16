'use client';

import { useQuery } from '@tanstack/react-query';
import type { CartDto, CartItemDto } from '@travelta/schemas';
import { AlertTriangle, ArrowRight, PenSquare, Search, ShoppingCart, Timer, Trash2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { ApiClientError } from '@travelta/api-client';
import { Input } from '@/components/ui/input';
import { useApi } from '@/components/api-provider';
import { ProductThumb } from '@/components/brand/product-thumb';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { priceOf } from '@/features/search/format';
import { Link, useRouter } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

export function useCart(storefront?: string) {
  const api = useApi();
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ['cart', token, storefront ?? null], queryFn: () => api.call('cart.get', { storefront }) });
}

const seedOf = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** One cart line: what, when, who, price (and cost for staff), quote state. */
export function CartLine({ item, staff, actions, highlight }: { item: CartItemDto; staff: boolean; actions?: ReactNode; highlight?: ReactNode }) {
  const t = useTranslations('cart');
  const ts = useTranslations('search');
  const te = useTranslations('enums.serviceType');
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const date = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const o = item.occupancy;
  const rooms = item.serviceType === 'hotel' && o.rooms.length > 0;
  return (
    <article className={cn('flex flex-col gap-4 rounded-xl border bg-surface p-4 sm:flex-row', item.unavailable ? 'border-danger/40' : 'border-border')} data-testid="cart-line" data-item={item.id}>
      <ProductThumb serviceType={item.serviceType} seed={seedOf(item.id)} className="h-20 w-full shrink-0 sm:w-28" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{te(item.serviceType)}</Badge>
          {item.kind === 'manual' && <Badge tone="highlight">{t('manual')}</Badge>}
          {item.unavailable && <Badge tone="danger">{t('unavailable')}</Badge>}
          {!item.unavailable && item.expired && <Badge tone="warning"><Timer className="size-3" aria-hidden />{t('expired')}</Badge>}
        </div>
        <h3 className="font-semibold text-fg">{item.title[locale]}</h3>
        <p className="text-sm text-fg-muted">{item.subtitle[locale]}</p>
        <p className="text-sm text-fg-muted">
          {item.to ? t('dates', { from: date(item.from), to: date(item.to) }) : date(item.from)}
          {' · '}{t('travellers', { adults: rooms ? o.rooms.reduce((a, r) => a + r.adults, 0) : o.adults, children: rooms ? o.rooms.reduce((a, r) => a + r.childAges.length, 0) : o.children, infants: rooms ? 0 : o.infants })}
          {rooms && ` · ${t('rooms', { count: o.rooms.length })}`}
          {item.mealPlan && ` · ${ts(`meal_${item.mealPlan}`)}`}
        </p>
        {highlight}
        {!item.expired && !item.unavailable && <p className="text-xs text-fg-muted">{t('expiresIn', { time: format.dateTime(new Date(item.expiresAt), { hour: '2-digit', minute: '2-digit' }) })}</p>}
      </div>
      <div className="flex flex-row items-end justify-between gap-3 sm:flex-col sm:text-end">
        <div>
          {item.previousPriceMinor !== null && <p className="tabular text-xs text-fg-muted line-through">{t('priceWas', { price: priceOf(item.previousPriceMinor, item.breakdown.currency, locale) })}</p>}
          <p className="tabular text-lg font-bold text-fg" data-testid="line-price">{priceOf(item.priceMinor, item.breakdown.currency, locale)}</p>
          {staff && item.buyMinor !== null && <p className="tabular text-xs text-fg-muted">{t('yourCost')}: {priceOf(item.buyMinor, item.breakdown.currency, locale)}</p>}
        </div>
        {actions}
      </div>
    </article>
  );
}

export function CartTotals({ cart, children }: { cart: CartDto; children?: ReactNode }) {
  const t = useTranslations('cart');
  const locale = useLocale();
  const staff = cart.audience !== 'customer';
  return (
    <Card className="self-start lg:sticky lg:top-20">
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-fg-muted">{t('total')}</span>
          <span className="tabular text-2xl font-bold text-fg" data-testid="cart-total">{priceOf(cart.totalMinor, cart.currency, locale)}</span>
        </div>
        {staff && cart.costMinor !== null && (
          <>
            <div className="flex items-center justify-between text-sm"><span className="text-fg-muted">{t('yourCost')}</span><span className="tabular">{priceOf(cart.costMinor, cart.currency, locale)}</span></div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">{t('yourMargin')}</span>
              <span className="tabular font-medium text-success">{priceOf(cart.items.reduce((a, i) => a + i.priceMinor - i.taxMinor - (i.buyMinor ?? 0), 0), cart.currency, locale)}</span>
            </div>
          </>
        )}
        {cart.discountMinor > 0 && <div className="flex items-center justify-between text-sm" data-testid="cart-discount"><span className="text-fg-muted">{t('discountIncluded', { code: cart.promoCode ?? '' })}</span><span className="tabular font-medium text-success">−{priceOf(cart.discountMinor, cart.currency, locale)}</span></div>}
        {children}
      </CardBody>
    </Card>
  );
}

/** Storefront promo code (re-prices every offer in the cart through the pricing engine). */
function PromoBox({ cart, storefront }: { cart: CartDto; storefront?: string }) {
  const t = useTranslations('cart');
  const tv = useTranslations();
  const api = useApi();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = useAction((value: string | null) => api.call('cart.applyPromo', { code: value, storefront }), {
    success: (out) => (out.promoCode ? t('promoApplied') : t('promoRemoved')), invalidate: [['cart']], onSuccess: () => { setCode(''); setError(null); },
  });
  const run = (value: string | null) => apply.mutate(value, { onError: (e) => setError(e instanceof ApiClientError && e.fieldErrors().code ? tv(e.fieldErrors().code as never) : null) });
  if (cart.promoCode) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md bg-success-bg px-3 py-2 text-sm text-success" data-testid="promo-applied">
        <span className="font-mono font-semibold" dir="ltr">{cart.promoCode}</span>
        <Button size="sm" variant="ghost" onClick={() => run(null)} loading={apply.isPending}>{t('removePromo')}</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input name="promo" dir="ltr" placeholder={t('promoPlaceholder')} aria-label={t('promoPlaceholder')} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-invalid={error !== null} />
        <Button variant="outline" onClick={() => run(code)} disabled={code.trim().length < 3} loading={apply.isPending} data-testid="apply-promo">{t('apply')}</Button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function CartPage({ portalRoot = '/agency', storefront }: { portalRoot?: string; storefront?: string }) {
  const t = useTranslations('cart');
  const api = useApi();
  const router = useRouter();
  const cart = useCart(storefront);
  const remove = useAction((itemId: string) => api.call('cart.removeItem', { itemId, storefront }), { success: t('removed'), invalidate: [['cart']] });
  const staff = cart.data ? cart.data.audience !== 'customer' : false;
  const searchHref = portalRoot === '/account' ? '/search' : `${portalRoot}/search`;

  if (cart.isError) return <ErrorState onRetry={() => void cart.refetch()} />;
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {!cart.data ? <Skeleton className="h-48 w-full rounded-xl" />
        : cart.data.items.length === 0 ? (
          <EmptyState icon={<ShoppingCart aria-hidden />} title={t('empty')} body={t('emptyBody')} action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => router.push(searchHref)}><Search aria-hidden />{t('searchNow')}</Button>
              {staff && <Button variant="outline" onClick={() => router.push(`${portalRoot}/manual-booking`)}><PenSquare aria-hidden />{t('manualNow')}</Button>}
            </div>
          } />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex flex-col gap-3" data-testid="cart-lines">
              {cart.data.items.map((item) => (
                <CartLine key={item.id} item={item} staff={staff}
                  highlight={item.unavailable ? <p className="flex items-center gap-1.5 text-sm text-danger"><AlertTriangle className="size-4" aria-hidden />{t('unavailable')}</p> : undefined}
                  actions={<Button variant="ghost" size="sm" onClick={() => remove.mutate(item.id)} disabled={remove.isPending} data-testid="remove-line"><Trash2 aria-hidden />{t('remove')}</Button>} />
              ))}
            </div>
            <CartTotals cart={cart.data}>
              {!staff && <PromoBox cart={cart.data} storefront={storefront} />}
              <Button size="lg" className="w-full" onClick={() => router.push(`${portalRoot}/checkout`)} data-testid="go-checkout">{t('checkout')}<ArrowRight className="flip-rtl" aria-hidden /></Button>
              <Link href={searchHref} className="text-center text-sm font-medium text-primary hover:underline">{t('continue')}</Link>
            </CartTotals>
          </div>
        )}
    </>
  );
}
