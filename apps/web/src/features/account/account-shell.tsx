'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { VerifyEmailBanner } from '@/features/auth/verify-email';
import { StoreShell } from '@/features/storefront/store-shell';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { ACCOUNT_SECTIONS } from './account-nav';

/**
 * Customer account layout: the storefront header/footer (the landing page stays the customer's home) with a compact
 * account navigation — a sidebar on desktop, a scrollable tab bar on phones. No dashboard.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations('account');
  const pathname = usePathname();
  const name = useSession((s) => s.session?.user.name);
  const active = ACCOUNT_SECTIONS.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))?.key;
  return (
    <StoreShell>
      <VerifyEmailBanner />
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10" data-testid="account-shell">
        <nav aria-label={t('navLabel')} className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 hidden px-3 text-xs font-semibold tracking-wide text-fg-muted uppercase lg:block">{name ? t('hi', { name: name.split(' ')[0]! }) : t('navLabel')}</p>
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" data-testid="account-nav">
            {ACCOUNT_SECTIONS.map(({ key, path, label, icon: Icon }) => (
              <li key={key} className="shrink-0">
                <Link href={path} aria-current={active === key ? 'page' : undefined} data-section={key}
                  className={cn('flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors lg:rounded-md',
                    active === key ? 'bg-primary text-on-primary' : 'text-fg-muted hover:bg-subtle hover:text-fg')}>
                  <Icon className="size-4" aria-hidden />{t(label as never)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div key={active} className="tv-enter min-w-0">{children}</div>
      </div>
    </StoreShell>
  );
}
