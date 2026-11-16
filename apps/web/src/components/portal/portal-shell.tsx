'use client';

import { useSubscriptionAccess } from '@/features/subscriptions/hooks';
import { VerifyEmailBanner } from '@/features/auth/verify-email';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { Portal } from '@travelta/contracts';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, LogOut, Menu, ShoppingCart, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { LogoMark } from '@/components/brand/brand';
import { LocaleSwitcher } from '@/components/theme/locale-switcher';
import { ThemeToggle } from '@/components/theme/theme';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { useLogout, useSwitchOrg } from '@/features/auth/hooks';
import { Link, useRouter } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/errors';
import { PORTAL_ROOT } from '@/lib/nav';
import { useCan, useSession } from '@/lib/session';
import { SidebarNav } from './sidebar';

/** Agency staff who can book see their server-side cart from every page (W2 "sticky cart"). */
export function CartButton({ href = '/agency/cart' }: { href?: string }) {
  const t = useTranslations('cart');
  const api = useApi();
  const token = useSession((s) => s.token);
  const cart = useQuery({ queryKey: ['cart', token], queryFn: () => api.call('cart.get', {}) });
  const count = cart.data?.items.length ?? 0;
  return (
    <Link href={href} className="relative inline-flex size-10 items-center justify-center rounded-md text-fg hover:bg-subtle" aria-label={t('openCart', { count })} data-testid="cart-button">
      <ShoppingCart className="size-5" aria-hidden />
      {count > 0 && <span className="tabular absolute -end-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent" data-testid="cart-count">{count}</span>}
    </Link>
  );
}

function usePortalLabel(portal: Portal): string {
  const t = useTranslations('auth');
  const isSubAgency = useSession((s) => s.session?.organization.parentId != null);
  return {
    admin: t('portalAdmin'),
    agency: isSubAgency ? t('portalSubAgency') : t('portalAgency'),
    supplier: t('portalSupplier'),
    account: t('portalAccount'),
  }[portal];
}

function Brand({ portal }: { portal: Portal }) {
  const label = usePortalLabel(portal);
  return (
    <div className="flex items-center gap-2.5 px-2">
      <LogoMark className="size-9 shrink-0" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-semibold text-nav-fg">Travelta</span>
        <span className="text-[11px] font-semibold tracking-wide text-nav-muted uppercase" data-testid="portal-label">{label}</span>
      </span>
    </div>
  );
}

/** Switch between the organizations the user belongs to (TENANCY §1). The server re-issues the session and permissions. */
function OrgSwitcher() {
  const t = useTranslations('auth');
  const locale = useLocale() as 'en' | 'ar';
  const session = useSession((s) => s.session);
  const switchOrg = useSwitchOrg();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  if (!session) return null;
  if (session.memberships.length < 2) {
    return (
      <span className="hidden items-center gap-2 text-sm font-medium text-fg sm:flex">
        <Building2 className="size-4 text-fg-muted" aria-hidden />
        {session.organization.name[locale]}
      </span>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <Building2 className="size-4 shrink-0 text-fg-muted" aria-hidden />
      <span className="sr-only">{t('switchOrg')}</span>
      <Select
        aria-label={t('switchOrg')}
        className="h-9 max-w-56"
        value={session.organization.id}
        disabled={switchOrg.isPending}
        onChange={(e) =>
          switchOrg.mutate(e.target.value, {
            onSuccess: (next) => {
              toast.success(t('switched', { org: next.organization.name[locale] }));
              router.replace(PORTAL_ROOT[next.portal]);
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      >
        {session.memberships.map((m) => (
          <option key={m.tenantId} value={m.tenantId}>
            {m.orgName[locale]} — {m.roleName[locale]}
          </option>
        ))}
      </Select>
    </label>
  );
}

function UserMenu() {
  const t = useTranslations('auth');
  const locale = useLocale() as 'en' | 'ar';
  const session = useSession((s) => s.session);
  const logout = useLogout();
  const router = useRouter();
  if (!session) return null;
  const home = session.user.userType === 'customer' ? '/account/login' : '/login';
  return (
    <div className="flex items-center gap-3">
      <div className="hidden min-w-0 text-end md:block">
        <p className="truncate text-sm font-medium text-fg" data-testid="session-user">{session.user.name}</p>
        <p className="truncate text-xs text-fg-muted" data-testid="session-role">{session.role?.name[locale] ?? session.organization.name[locale]}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        loading={logout.isPending}
        onClick={() =>
          logout.mutate(undefined, {
            onSettled: () => {
              toast.success(t('signedOut'));
              router.replace(home);
            },
          })
        }
      >
        <LogOut className="flip-rtl" aria-hidden />
        {/* The visible label collapses on phones; screen readers always get it. */}
        <span className="sr-only sm:not-sr-only">{t('signOut')}</span>
      </Button>
    </div>
  );
}

/** SUB-2: trial countdown, past-due grace and suspended (read-only) states, linking to the subscription page. */
function SubscriptionBanner() {
  const t = useTranslations('subscriptions');
  const access = useSubscriptionAccess().data;
  const canManage = useCan('subscriptions.manage');
  if (!access?.status) return null;
  const tone = access.status === 'suspended' || access.status === 'cancelled' ? 'danger' : access.status === 'past_due' ? 'warning' : access.status === 'trialing' && (access.daysLeftInTrial ?? 99) <= 7 ? 'info' : null;
  if (!tone) return null;
  const message = access.status === 'trialing' ? t('bannerTrial', { days: access.daysLeftInTrial ?? 0 })
    : access.status === 'past_due' ? t('bannerPastDue', { date: access.graceEndsAt ?? '' }) : access.status === 'suspended' ? t('bannerSuspended') : t('bannerCancelled');
  return (
    <div role="status" data-testid="subscription-banner" data-status={access.status}
      className={tone === 'danger' ? 'flex flex-wrap items-center gap-2 border-b border-danger/30 bg-danger-bg px-4 py-2.5 text-sm text-danger sm:px-8' : tone === 'warning' ? 'flex flex-wrap items-center gap-2 border-b border-warning/30 bg-warning-bg px-4 py-2.5 text-sm text-warning sm:px-8' : 'flex flex-wrap items-center gap-2 border-b border-info/30 bg-info-bg px-4 py-2.5 text-sm text-info sm:px-8'}>
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <p className="font-medium">{message}</p>
      {canManage && <Link href="/agency/subscription" className="font-semibold underline">{t('manage')}</Link>}
    </div>
  );
}

/** Warns when the organization can't book or sell (KYC-4/5); enforcement itself is server-side (ORG_NOT_ELIGIBLE). */
function OrgStatusBanner() {
  const t = useTranslations('auth');
  const status = useSession((s) => s.session?.organization.status);
  const message =
    status === 'pending_kyc' ? t('orgPending') : status === 'blocked_expired_docs' ? t('orgBlocked') : status === 'suspended' ? t('orgSuspended') : null;
  if (!message) return null;
  return (
    <div role="status" data-testid="org-status-banner" className="flex items-start gap-2 border-b border-warning/30 bg-warning-bg px-4 py-2.5 text-sm text-warning sm:px-8">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="font-medium">{message}</p>
    </div>
  );
}

export function PortalShell({ portal, children }: { portal: Portal; children: ReactNode }) {
  const t = useTranslations('common');
  const tStore = useTranslations('store');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const canBook = useCan('bookings.create');

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-nav p-4 lg:flex" data-testid="sidebar">
        <Link href={PORTAL_ROOT[portal]}>
          <Brand portal={portal} />
        </Link>
        <SidebarNav portal={portal} />
      </aside>

      <BaseDialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <BaseDialog.Portal>
          <BaseDialog.Backdrop className="fixed inset-0 bg-overlay transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0 lg:hidden" />
          <BaseDialog.Popup className="fixed inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-nav p-4 transition-transform data-ending-style:-translate-x-full data-starting-style:-translate-x-full rtl:data-ending-style:translate-x-full rtl:data-starting-style:translate-x-full lg:hidden">
            <div className="flex items-center justify-between">
              <BaseDialog.Title className="sr-only">Travelta</BaseDialog.Title>
              <Brand portal={portal} />
              <BaseDialog.Close className="rounded-md p-1 text-nav-fg hover:bg-white/10" aria-label={t('close')}>
                <X className="size-5" aria-hidden />
              </BaseDialog.Close>
            </div>
            <SidebarNav portal={portal} onNavigate={() => setDrawerOpen(false)} />
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Menu">
            <Menu aria-hidden />
          </Button>
          <OrgSwitcher />
          <div className="ms-auto flex items-center gap-2">
            {portal === 'agency' && canBook && <CartButton />}
            {portal === 'account' && <><Link href="/search" className="hidden text-sm font-medium text-primary hover:underline sm:inline" data-testid="book-trip">{tStore('bookTrip')}</Link><CartButton href="/account/cart" /></>}
            <NotificationBell />
            <ThemeToggle className="hidden sm:inline-flex" />
            <LocaleSwitcher />
            <UserMenu />
          </div>
        </header>
        <OrgStatusBanner />
        <SubscriptionBanner />
        <VerifyEmailBanner />
        <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
