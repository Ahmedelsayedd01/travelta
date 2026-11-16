import { ArrowRight, BadgePercent, Briefcase, CalendarCheck, CheckCircle2, Globe2, Lock, Search, ShieldCheck, Store, Truck, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { MockApiGate } from '@/components/api-provider';
import { TravelPhoto } from '@/components/brand/product-thumb';
import { CategoryShowcase } from '@/features/search/categories/showcase';
import { FeaturedDestinations, PopularRow } from '@/features/storefront/discovery';
import { HeroSearch, ServiceTiles, StoreShell } from '@/features/storefront/store-shell';
import { Link } from '@/i18n/navigation';
import { asLocale } from '@/i18n/routing';
import { cn } from '@/lib/cn';

/**
 * Travelta Direct storefront home (M21, W12): live search for all seven services in the hero, service shortcuts,
 * the current promo and the business entry points. The design system lives in Admin → Settings.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(asLocale(locale));
  const t = await getTranslations();

  const audiences = [
    { icon: Briefcase, title: t('home.agencyTitle'), body: t('home.agencyBody') },
    { icon: Truck, title: t('home.supplierTitle'), body: t('home.supplierBody') },
    { icon: Users, title: t('home.travellerTitle'), body: t('home.travellerBody') },
  ];
  const why = [
    { icon: Search, title: t('home.why1Title'), body: t('home.why1Body') },
    { icon: ShieldCheck, title: t('home.why2Title'), body: t('home.why2Body') },
    { icon: CalendarCheck, title: t('home.why3Title'), body: t('home.why3Body') },
  ];
  const trust = [
    { icon: ShieldCheck, text: t('home.trust1') },
    { icon: Lock, text: t('home.trust2') },
    { icon: Globe2, text: t('home.trust3') },
  ];

  return (
    <StoreShell>
      <section className="relative overflow-hidden bg-hero text-on-hero">
        {/* Licensed photo (see /credits) under a navy scrim that keeps every hero text at AA contrast. */}
        <TravelPhoto image="tour-pyramids" variant="hero" className="absolute inset-0" priority decorative />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#102A43]/95 via-[#102A43]/80 to-[#102A43]/45 rtl:bg-gradient-to-l" aria-hidden />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:py-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />{t('home.eyebrow')}
            </p>
            <h1 className="max-w-3xl text-4xl leading-tight font-bold tracking-tight sm:text-5xl">{t('store.heroTitle')}</h1>
            <p className="mt-5 max-w-xl text-lg opacity-85">{t('store.heroBody')}</p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm opacity-90">
              {trust.map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-2"><Icon className="size-4 text-accent" aria-hidden />{text}</li>
              ))}
            </ul>
          </div>
          <HeroSearch />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14">
        <MockApiGate fallback={null}><CategoryShowcase /></MockApiGate>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold text-fg sm:text-3xl">{t('home.servicesTitle')}</h2>
        <p className="mt-2 max-w-2xl text-fg-muted">{t('home.servicesBody')}</p>
        <ServiceTiles />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <h2 className="text-2xl font-semibold text-fg sm:text-3xl">{t('home.destinationsTitle')}</h2>
        <p className="mt-2 max-w-2xl text-fg-muted">{t('home.destinationsBody')}</p>
        <FeaturedDestinations />
        <PopularRow serviceType="hotel" destinationCode="CAI" title={t('home.popularHotels')} />
        <PopularRow serviceType="tour" destinationCode="LXR" title={t('home.popularTours')} />
        <PopularRow serviceType="umrah" destinationCode="MKX" title={t('home.popularUmrah')} />
        <PopularRow serviceType="activity" destinationCode="HRG" title={t('home.popularActivities')} />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-fg sm:text-3xl">{t('home.whyTitle')}</h2>
            <ul className="mt-6 flex flex-col gap-5">
              {why.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-on-primary-soft"><Icon className="size-5" aria-hidden /></span>
                  <span><span className="block font-semibold text-fg">{title}</span><span className="text-sm text-fg-muted">{body}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-fg sm:text-3xl">{t('home.howTitle')}</h2>
            <ol className="mt-6 flex flex-col gap-4">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-4 rounded-xl border border-border bg-surface p-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-on-secondary" aria-hidden>{n}</span>
                  <span><span className="block font-semibold text-fg">{t(`home.how${n}Title` as never)}</span><span className="text-sm text-fg-muted">{t(`home.how${n}Body` as never)}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary-soft/40 px-6 py-5" data-testid="promo-banner">
          <div className="flex items-center gap-3">
            <BadgePercent className="size-8 text-primary" aria-hidden />
            <div><p className="font-semibold text-fg">{t('store.promoTitle')}</p><p className="text-sm text-fg-muted">{t('store.promoBody')}</p></div>
          </div>
          <code className="rounded-md border border-dashed border-primary px-3 py-1.5 font-mono text-sm font-bold text-fg" dir="ltr">WELCOME10</code>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold text-fg sm:text-3xl">{t('home.audiencesTitle')}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {audiences.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col gap-3 rounded-xl border border-border bg-canvas p-6">
                <span className="flex size-11 items-center justify-center rounded-lg bg-secondary text-on-secondary"><Icon className="size-5" aria-hidden /></span>
                <h3 className="text-lg font-semibold text-fg">{title}</h3>
                <p className="text-sm text-fg-muted">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register/business" className={buttonVariants({ variant: 'secondary' })}><Store aria-hidden />{t('home.becomePartner')}<ArrowRight className="flip-rtl" aria-hidden /></Link>
            <Link href="/login" className={buttonVariants({ variant: 'outline' })}>{t('auth.businessLogin')}</Link>
            <Link href="/account/register" className={cn(buttonVariants({ variant: 'ghost' }))}><CheckCircle2 aria-hidden />{t('home.createAccount')}</Link>
          </div>
        </div>
      </section>
    </StoreShell>
  );
}
