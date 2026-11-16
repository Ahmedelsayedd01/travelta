import { SERVICE_TYPES } from '@travelta/contracts';
import { CheckCircle2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo, SERVICE_ICONS } from '@/components/brand/brand';
import { LocaleSwitcher } from '@/components/theme/locale-switcher';
import { ThemeToggle } from '@/components/theme/theme';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

/**
 * Split layout for sign-in, registration and onboarding: a brand panel (desktop) beside the form card.
 * No design-system link here — it lives in Admin → Settings.
 */
export async function AuthCard({
  title, subtitle, children, footer, wide = false,
}: { title: ReactNode; subtitle: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const t = await getTranslations();
  const points = [t('home.brandPoint1'), t('home.brandPoint2'), t('home.brandPoint3')];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden bg-hero p-10 text-on-hero lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(40rem_25rem_at_100%_0%,var(--tv-accent),transparent_60%),radial-gradient(30rem_20rem_at_0%_100%,var(--tv-primary),transparent_60%)]" aria-hidden />
        <Link href="/" className="relative" aria-label="Travelta"><Logo tone="inverse" /></Link>
        <div className="relative">
          <h2 className="max-w-md text-3xl leading-tight font-semibold">{t('home.brandTitle')}</h2>
          <ul className="mt-6 flex flex-col gap-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 opacity-90"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />{p}</li>
            ))}
          </ul>
        </div>
        <ul className="relative flex flex-wrap gap-2" aria-hidden>
          {SERVICE_TYPES.map((s) => {
            const Icon = SERVICE_ICONS[s];
            return (
              <li key={s} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                <Icon className="size-3.5 text-accent" />{t(`enums.serviceType.${s}`)}
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/" className="lg:invisible" aria-label="Travelta"><Logo /></Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0">
          <div className={cn('w-full', wide ? 'max-w-2xl' : 'max-w-md')}>
            <h1 className="text-2xl font-semibold text-fg sm:text-3xl">{title}</h1>
            <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 border-t border-border pt-5 text-sm text-fg-muted">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
