import { SERVICE_TYPES } from '@travelta/contracts';
import type { TravelImageKey } from '@travelta/shared';
import { CheckCircle2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo, SERVICE_ICONS } from '@/components/brand/brand';
import { TravelPhoto } from '@/components/brand/product-thumb';
import { LocaleSwitcher } from '@/components/theme/locale-switcher';
import { ThemeToggle } from '@/components/theme/theme';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

/**
 * Split layout for sign-in, registration and password recovery: a destination photo with the value proposition
 * (desktop) beside the form; on phones a slim photo banner above a single column.
 * `audience` picks the copy: travellers see trip benefits, businesses the platform benefits.
 */
export async function AuthCard({
  title, subtitle, children, footer, wide = false, audience = 'business', image = 'flight-wing',
}: { title: ReactNode; subtitle: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; audience?: 'customer' | 'business'; image?: TravelImageKey }) {
  const t = await getTranslations();
  const customer = audience === 'customer';
  const points = customer
    ? [t('auth.customerPoint1'), t('auth.customerPoint2'), t('auth.customerPoint3')]
    : [t('home.brandPoint1'), t('home.brandPoint2'), t('home.brandPoint3')];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-hero p-10 text-on-hero lg:flex lg:flex-col lg:justify-between" data-testid="auth-visual">
        <TravelPhoto image={image} variant="hero" className="absolute inset-0" sizes="50vw" priority decorative />
        {/* Navy scrim: keeps the copy at AA contrast on any photo. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#102A43]/95 via-[#102A43]/55 to-[#102A43]/70" aria-hidden />
        <Link href="/" className="relative self-start"><Logo tone="inverse" /></Link>
        <div className="relative">
          <h2 className="max-w-md text-3xl leading-tight font-semibold">{customer ? t('auth.customerVisualTitle') : t('home.brandTitle')}</h2>
          <ul className="mt-6 flex flex-col gap-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />{p}</li>
            ))}
          </ul>
          <ul className="mt-8 flex flex-wrap gap-2" aria-hidden>
            {SERVICE_TYPES.map((s) => {
              const Icon = SERVICE_ICONS[s];
              return (
                <li key={s} className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                  <Icon className="size-3.5 text-accent" />{t(`enums.serviceType.${s}`)}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <div className="relative h-32 overflow-hidden lg:hidden" aria-hidden>
          <TravelPhoto image={image} variant="card" className="absolute inset-0" sizes="100vw" decorative />
          <div className="absolute inset-0 bg-gradient-to-b from-[#102A43]/60 to-[#102A43]/20" />
        </div>
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/" className="lg:invisible"><Logo /></Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pt-2 pb-16 sm:items-center sm:pt-0">
          <div className={cn('w-full', wide ? 'max-w-2xl' : 'max-w-md')}>
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
            <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 border-t border-border pt-5 text-sm text-fg-muted">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
