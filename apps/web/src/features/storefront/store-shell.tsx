'use client';

import { useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES } from '@travelta/contracts';
import { LifeBuoy, LogIn, ShoppingCart, Ticket, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MockApiGate, useApi } from '@/components/api-provider';
import { Logo, SERVICE_ICONS } from '@/components/brand/brand';
import { LocaleSwitcher } from '@/components/theme/locale-switcher';
import { ThemeToggle } from '@/components/theme/theme';
import { buttonVariants } from '@/components/ui/button';
import { useDemoToday } from '@/features/demo/hooks';
import { defaultCriteria, SearchForm, type SearchCriteria } from '@/features/search/search-form';
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
  const { hydrated, customer } = useCustomer();
  if (!hydrated) return <span className="w-24" />;
  if (customer) {
    return (
      <>
        <MockApiGate fallback={null}><StoreCart /></MockApiGate>
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
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-6">
            <Link href="/" aria-label="Travelta"><Logo /></Link>
            <Link href="/search" className="hidden text-sm font-medium text-fg-muted hover:text-fg sm:inline" data-testid="store-search-link">{t('search')}</Link>
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-fg-muted">
          <Logo className="opacity-80" />
          <div className="flex flex-wrap gap-4">
            <Link href="/account/support" className="inline-flex items-center gap-1.5 hover:text-fg"><LifeBuoy className="size-4" aria-hidden />{t('support')}</Link>
            <Link href="/login" className="hover:text-fg">{ta('businessLogin')}</Link>
            <Link href="/register/business" className="hover:text-fg">{t('partner')}</Link>
          </div>
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
  const today = useDemoToday();
  return (
    <div className="rounded-xl bg-surface p-4 text-fg shadow-lg" data-testid="hero-search">
      <SearchForm key={today} initial={defaultCriteria('hotel', today)} staff={false} onSearch={(c) => router.push(toSearch(c))} />
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
            <Link href={toSearch(defaultCriteria(s), base)} data-service={s} className="flex h-full flex-col items-center gap-3 rounded-xl border border-border bg-surface p-5 text-center shadow-xs transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"><Icon className="size-6" aria-hidden /></span>
              <span className="text-sm font-semibold text-fg">{te(`serviceType.${s}`)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
