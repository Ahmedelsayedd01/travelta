'use client';

import { useQuery } from '@tanstack/react-query';
import type { PublicStorefront } from '@travelta/schemas';
import { LogIn, LogOut, Mail, Phone, ShoppingCart, Ticket } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { MockApiGate, useApi } from '@/components/api-provider';
import { EmptyState } from '@/components/feedback/states';
import { LocaleSwitcher } from '@/components/theme/locale-switcher';
import { ThemeToggle } from '@/components/theme/theme';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LoginForm } from '@/features/auth/login-form';
import { RegisterForm } from '@/features/auth/register-form';
import { useLogout } from '@/features/auth/hooks';
import { BookingDetail } from '@/features/bookings/booking-detail';
import { BookingsBaseContext, BookingsPage } from '@/features/bookings/bookings-page';
import { VoucherView } from '@/features/bookings/voucher';
import { AddToCartButton } from '@/features/cart/add-to-cart';
import { CartPage } from '@/features/cart/cart-page';
import { CheckoutPage } from '@/features/checkout/checkout-page';
import { useDemoToday } from '@/features/demo/hooks';
import { BookingFinancePanel, FINANCE_ACTIONS } from '@/features/finance/booking-finance';
import { defaultCriteria, SearchForm } from '@/features/search/search-form';
import { SearchExperience } from '@/features/search/search-page';
import { ServiceTiles } from './store-shell';
import { Link, useRouter } from '@/i18n/navigation';
import { useSession, useSessionHydrated } from '@/lib/session';

/** Brand colours override the theme tokens for this subtree only (white text on both is AA-checked when saved). */
const brandStyle = (s: PublicStorefront) => ({ '--tv-primary': s.primaryColor, '--tv-primary-hover': s.primaryColor, '--tv-on-primary': '#FFFFFF', '--tv-hero': s.heroColor, '--tv-on-hero': '#FFFFFF', '--tv-focus': s.primaryColor }) as CSSProperties;

function useStoreCustomer(store: PublicStorefront) {
  const hydrated = useSessionHydrated();
  const session = useSession((s) => s.session);
  return { hydrated, mine: session?.user.userType === 'customer' && session.organization.id === store.orgId ? session : null };
}

function StoreCartLink({ base, slug }: { base: string; slug: string }) {
  const t = useTranslations('cart');
  const api = useApi();
  const token = useSession((s) => s.token);
  const cart = useQuery({ queryKey: ['cart', token, slug], queryFn: () => api.call('cart.get', { storefront: slug }) });
  const count = cart.data?.items.length ?? 0;
  return (
    <Link href={`${base}/cart`} className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-subtle" aria-label={t('openCart', { count })} data-testid="store-cart">
      <ShoppingCart className="size-5" aria-hidden />
      {count > 0 && <span className="tabular absolute -end-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-on-primary" data-testid="cart-count">{count}</span>}
    </Link>
  );
}

function Gate({ store, base, children }: { store: PublicStorefront; base: string; children: ReactNode }) {
  const t = useTranslations('storefront');
  const { hydrated, mine } = useStoreCustomer(store);
  if (!hydrated) return <Skeleton className="h-64 w-full" />;
  if (!mine) return <EmptyState icon={<LogIn aria-hidden />} title={t('signInTitle')} body={t('signInBody')} action={<Link href={`${base}/login?next=${encodeURIComponent(window.location.pathname.replace(/^\/(en|ar)/, ''))}`} className={buttonVariants()} data-testid="branded-sign-in">{t('signIn')}</Link>} />;
  return <>{children}</>;
}

function Auth({ store, base, mode }: { store: PublicStorefront; base: string; mode: 'login' | 'register' }) {
  const t = useTranslations('storefront');
  const locale = useLocale() as 'en' | 'ar';
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const done = () => router.push(next && next.startsWith(base) ? next : base);
  return (
    <div className="mx-auto max-w-md py-10">
      <Card><CardBody className="flex flex-col gap-4">
        <div><h1 className="text-xl font-semibold">{mode === 'login' ? t('welcomeBack', { name: store.displayName[locale] }) : t('createAccount', { name: store.displayName[locale] })}</h1></div>
        {mode === 'login' ? <LoginForm audience="customer" storefront={store.slug} storefrontOrg={store.orgName.en} onDone={done} /> : <RegisterForm storefront={store.slug} onDone={done} />}
        <p className="text-sm text-fg-muted">{mode === 'login' ? <Link href={`${base}/register`} className="font-medium text-primary hover:underline">{t('noAccount')}</Link> : <Link href={`${base}/login`} className="font-medium text-primary hover:underline">{t('haveAccount')}</Link>}</p>
      </CardBody></Card>
    </div>
  );
}

function Home({ store, base }: { store: PublicStorefront; base: string }) {
  const locale = useLocale() as 'en' | 'ar';
  const router = useRouter();
  const today = useDemoToday();
  return (
    <>
      <section className="bg-hero text-on-hero">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12">
          <h1 className="max-w-3xl text-3xl font-bold sm:text-4xl" data-testid="branded-tagline">{store.tagline[locale]}</h1>
          <div className="rounded-xl bg-surface p-4 text-fg shadow-lg" data-testid="branded-search">
            <SearchForm key={today} initial={defaultCriteria('hotel', today)} staff={false} onSearch={(c) => router.push(`${base}/search?s=${encodeURIComponent(JSON.stringify(c))}`)} />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-12"><ServiceTiles base={base} /></section>
    </>
  );
}

function Body({ store, path }: { store: PublicStorefront; path: string[] }) {
  const t = useTranslations('storefront');
  const base = `/s/${store.slug}`;
  const { mine } = useStoreCustomer(store);
  const [section, id, sub, itemId] = path;
  switch (section) {
    case undefined: return <Home store={store} base={base} />;
    case 'login': return <Auth store={store} base={base} mode="login" />;
    case 'register': return <Auth store={store} base={base} mode="register" />;
    case 'search':
      return (
        <div className="mx-auto max-w-6xl px-4 py-8">
          <SearchExperience staff={false} storefront={store.slug}
            offerActions={(offerId, _r, input, close) => (mine
              ? <AddToCartButton offerId={offerId} input={input} onAdded={close} cartHref={`${base}/cart`} storefront={store.slug} />
              : <Link href={`${base}/login?next=${encodeURIComponent(`${base}/search${window.location.search}`)}`} className={buttonVariants()} data-testid="sign-in-to-book"><LogIn aria-hidden />{t('signInToBook')}</Link>)} />
        </div>
      );
    case 'cart': return <div className="mx-auto max-w-6xl px-4 py-8"><Gate store={store} base={base}><CartPage portalRoot={base} storefront={store.slug} /></Gate></div>;
    case 'checkout': return <div className="mx-auto max-w-6xl px-4 py-8"><Gate store={store} base={base}><CheckoutPage portalRoot={base} storefront={store.slug} /></Gate></div>;
    case 'bookings':
      return (
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Gate store={store} base={base}>
            {id && sub === 'voucher' && itemId ? <VoucherView bookingId={id} itemId={itemId} />
              : id ? <BookingDetail id={id} extraActions={FINANCE_ACTIONS} sections={(b) => <BookingFinancePanel booking={b} />} /> : <BookingsPage />}
          </Gate>
        </div>
      );
    default: return <div className="mx-auto max-w-6xl px-4 py-16"><EmptyState title={t('notFound')} /></div>;
  }
}

function Branded({ slugParam, path }: { slugParam: string; path: string[] }) {
  const t = useTranslations('storefront');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const logout = useLogout();
  const host = slugParam === '_' ? window.location.host : undefined;
  const q = useQuery({ queryKey: ['storefront', 'public', slugParam, host], queryFn: () => api.call('storefront.public', host ? { host } : { slug: slugParam }), retry: false });
  if (q.isError) return <div className="mx-auto max-w-xl px-4 py-24"><EmptyState title={t('unavailable')} body={t('unavailableBody')} action={<Link href="/" className="font-medium text-primary hover:underline">{t('goTravelta')}</Link>} /></div>;
  if (!q.data) return <Skeleton className="m-8 h-96" />;
  const store = q.data;
  const base = `/s/${store.slug}`;
  return (
    <div className="flex min-h-dvh flex-col" style={brandStyle(store)} data-testid="branded-storefront" data-store={store.slug}>
      <BookingsBaseContext.Provider value={`${base}/bookings`}>
        <Header store={store} base={base} onLogout={() => logout.mutate()} />
        <main className="flex-1"><Body store={store} path={path} /></main>
        <footer className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-fg-muted">
            <span className="font-medium text-fg">{store.displayName[locale]}</span>
            <span className="flex flex-wrap gap-4" dir="ltr">
              {store.supportEmail && <a href={`mailto:${store.supportEmail}`} className="inline-flex items-center gap-1 hover:text-fg"><Mail className="size-4" aria-hidden />{store.supportEmail}</a>}
              {store.supportPhone && <span className="inline-flex items-center gap-1"><Phone className="size-4" aria-hidden />{store.supportPhone}</span>}
            </span>
            {store.showPoweredBy && <span data-testid="powered-by">{t('poweredByTravelta')}</span>}
          </div>
        </footer>
      </BookingsBaseContext.Provider>
    </div>
  );
}

function Header({ store, base, onLogout }: { store: PublicStorefront; base: string; onLogout: () => void }) {
  const t = useTranslations('storefront');
  const locale = useLocale() as 'en' | 'ar';
  const { hydrated, mine } = useStoreCustomer(store);
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href={base} className="flex items-center gap-2" data-testid="branded-logo">
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded logo kept as a data URL (no image optimizer applies) */}
          {store.logoUrl ? <img src={store.logoUrl} alt="" className="size-8 rounded object-contain" /> : <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-on-primary">{store.displayName[locale].slice(0, 1)}</span>}
          <span className="font-semibold">{store.displayName[locale]}</span>
        </Link>
        <nav className="flex items-center gap-1.5">
          <Link href={`${base}/search`} className="hidden px-2 text-sm font-medium text-fg-muted hover:text-fg sm:inline">{t('search')}</Link>
          <ThemeToggle className="hidden sm:inline-flex" />
          <LocaleSwitcher />
          {hydrated && (mine ? (
            <>
              <StoreCartLink base={base} slug={store.slug} />
              <Link href={`${base}/bookings`} className={buttonVariants({ variant: 'ghost', size: 'sm' })} data-testid="branded-trips"><Ticket aria-hidden />{t('myTrips')}</Link>
              <Button variant="ghost" size="icon" onClick={onLogout} aria-label={t('signOut')}><LogOut aria-hidden /></Button>
            </>
          ) : <Link href={`${base}/login`} className={buttonVariants({ size: 'sm' })} data-testid="branded-login"><LogIn aria-hidden />{t('signIn')}</Link>)}
        </nav>
      </div>
    </header>
  );
}

/** `/s/<slug>/…` (and `<sub>.localhost` / verified custom domains via the proxy, slug `_`): an agency's own storefront. */
export function BrandedStorefront({ slug, path }: { slug: string; path: string[] }) {
  return <MockApiGate><Branded slugParam={slug} path={path} /></MockApiGate>;
}
