import { ArrowRight, BadgePercent, Briefcase, CheckCircle2, Globe2, Lock, ShieldCheck, Store, Truck, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
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
  const trust = [
    { icon: ShieldCheck, text: t('home.trust1') },
    { icon: Lock, text: t('home.trust2') },
    { icon: Globe2, text: t('home.trust3') },
  ];

  return (
    <StoreShell>
      <section className="relative overflow-hidden bg-hero text-on-hero">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(60rem_30rem_at_85%_-10%,var(--tv-accent),transparent_60%),radial-gradient(40rem_25rem_at_-10%_110%,var(--tv-primary),transparent_60%)]" aria-hidden />
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

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold text-fg sm:text-3xl">{t('home.servicesTitle')}</h2>
        <p className="mt-2 max-w-2xl text-fg-muted">{t('home.servicesBody')}</p>
        <ServiceTiles />
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
