'use client';

import { useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES } from '@travelta/contracts';
import { Heart, LifeBuoy, LogIn, ShoppingCart, Ticket, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MockApiGate, useApi } from '@/components/api-provider';
import { Logo, SERVICE_ICONS } from '@/components/brand/brand';
import { TravelPhoto } from '@/components/brand/product-thumb';
import { SERVICE_IMAGES } from '@travelta/shared';
import { LocaleSwitcher } from '@/components/theme/locale-switcher';
import { ThemeToggle } from '@/components/theme/theme';
import { buttonVariants } from '@/components/ui/button';
import { useDemoToday } from '@/features/demo/hooks';
import { defaultCriteria, SearchForm, type SearchCriteria } from '@/features/search/search-form';
import { useSelectedCategory } from '@/features/search/categories/showcase';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { useSession, useSessionHydrated } from '@/lib/session';

/** Signed-in storefront customer (the B2C audience) or null. */
export function useCustomer() {
  const hydrated = useSessionHydrated();
  const session = useSession((s) => s.session);
  return { hydrated, customer: session?.user.userType === 'customer' ? session : null };
}

function StoreCart() {
  const t = useTranslations('cart');
  const api = useApi();
  const token = useSession((s) => s.token);
  const cart = useQuery({ queryKey: ['cart', token], queryFn: () => api.call('cart.get', {}) });
  const count = cart.data?.items.length ?? 0;
  return (
    <Link href="/account/cart" className="relative inline-flex size-10 items-center justify-center rounded-md text-fg hover:bg-subtle" aria-label={t('openCart', { count })} data-testid="store-cart">
      <ShoppingCart className="size-5" aria-hidden />
      {count > 0 && <span className="tabular absolute -end-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent" data-testid="cart-count">{count}</span>}
    </Link>
  );
}

/** Header actions for the public storefront: account & cart for customers, sign-in / register otherwise. */
export function StoreHeaderActions() {
  const t = useTranslations('store');
  const th = useTranslations('home');
  const tn = useTranslations('nav');
  const { hydrated, customer } = useCustomer();
  if (!hydrated) return <span className="w-24" />;
  if (customer) {
    return (
      <>
        <MockApiGate fallback={null}><StoreCart /></MockApiGate>
        <Link href="/account/favorites" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden md:inline-flex')} data-testid="my-favorites"><Heart aria-hidden />{tn('favorites')}</Link>
        <Link href="/account/bookings" className={buttonVariants({ variant: 'ghost', size: 'sm' })} data-testid="my-trips"><Ticket aria-hidden />{t('myTrips')}</Link>
      </>
    );
  }
  return (
    <>
      <Link href="/account/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })} data-testid="store-sign-in"><LogIn aria-hidden />{th('signIn')}</Link>
      <Link href="/account/register" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'hidden sm:inline-flex')}><UserPlus aria-hidden />{t('register')}</Link>
    </>
  );
}

/** Public storefront chrome (Travelta Direct): header, content, footer with support and business links. */
export function StoreShell({ children }: { children: ReactNode }) {
  const t = useTranslations('store');
  const ta = useTranslations('auth');
  const te = useTranslations('enums');
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-6">
            <Link href="/" aria-label="Travelta"><Logo /></Link>
            <Link href="/search" className="hidden text-sm font-medium text-fg-muted hover:text-fg sm:inline xl:hidden" data-testid="store-search-link">{t('search')}</Link>
            <nav aria-label={t('servicesNav')} className="hidden items-center gap-4 xl:flex">
              {SERVICE_TYPES.map((s) => <Link key={s} href={toSearch(defaultCriteria(s))} className="text-sm font-medium text-fg-muted hover:text-fg">{te(`serviceType.${s}`)}</Link>)}
            </nav>
          </div>
          <nav className="flex items-center gap-1.5">
            <ThemeToggle className="hidden sm:inline-flex" />
            <LocaleSwitcher />
            <StoreHeaderActions />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3"><Logo className="opacity-90" /><p className="max-w-xs">{t('footerAbout')}</p></div>
          <nav aria-label={t('servicesNav')} className="flex flex-col gap-2">
            <p className="font-semibold text-fg">{t('servicesNav')}</p>
            {SERVICE_TYPES.map((s) => <Link key={s} href={toSearch(defaultCriteria(s))} className="hover:text-fg">{te(`serviceType.${s}`)}</Link>)}
          </nav>
          <nav aria-label={t('footerAccount')} className="flex flex-col gap-2">
            <p className="font-semibold text-fg">{t('footerAccount')}</p>
            <Link href="/account/bookings" className="hover:text-fg">{t('myTrips')}</Link>
            <Link href="/account/favorites" className="hover:text-fg">{t('footerFavorites')}</Link>
            <Link href="/account/support" className="inline-flex items-center gap-1.5 hover:text-fg"><LifeBuoy className="size-4" aria-hidden />{t('support')}</Link>
          </nav>
          <nav aria-label={t('footerBusiness')} className="flex flex-col gap-2">
            <p className="font-semibold text-fg">{t('footerBusiness')}</p>
            <Link href="/login" className="hover:text-fg">{ta('businessLogin')}</Link>
            <Link href="/register/business" className="hover:text-fg">{t('partner')}</Link>
            <Link href="/credits" className="hover:text-fg" data-testid="credits-link">{t('photoCredits')}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

const toSearch = (c: SearchCriteria, base = '') => `${base}/search?s=${encodeURIComponent(JSON.stringify(c))}`;

/** Hero search on the home page: the same form as everywhere, opening the results page. */
export function HeroSearch() {
  return (
    <MockApiGate fallback={<div className="h-64 rounded-xl bg-white/10" />}>
      <HeroSearchForm />
    </MockApiGate>
  );
}

function HeroSearchForm() {
  const router = useRouter();
  const setCategory = useSelectedCategory((s) => s.set);
  const today = useDemoToday();
  return (
    <div className="rounded-xl bg-surface p-4 text-fg shadow-lg" data-testid="hero-search">
      <SearchForm key={today} initial={defaultCriteria('hotel', today)} staff={false} onSearch={(c) => router.push(toSearch(c))} onServiceChange={setCategory} />
    </div>
  );
}

/** Service tiles that open a search for that service. */
export function ServiceTiles({ base = '' }: { base?: string } = {}) {
  const te = useTranslations('enums');
  return (
    <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="service-tiles">
      {SERVICE_TYPES.map((s) => {
        const Icon = SERVICE_ICONS[s];
        return (
          <li key={s}>
            <Link href={toSearch(defaultCriteria(s), base)} data-service={s} className="group relative flex aspect-[4/5] h-full flex-col justify-end overflow-hidden rounded-xl shadow-xs transition hover:-translate-y-0.5 hover:shadow-md sm:aspect-[3/4]">
              <TravelPhoto image={SERVICE_IMAGES[s][0]!} className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" sizes="(min-width: 1024px) 160px, 50vw" decorative />
              <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" aria-hidden />
              <span className="relative flex items-center gap-2 p-3 text-white">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm"><Icon className="size-4" aria-hidden /></span>
                <span className="text-sm font-semibold leading-tight">{te(`serviceType.${s}`)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
