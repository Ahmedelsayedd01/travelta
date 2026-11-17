'use client';

import type { Permission, Portal } from '@travelta/contracts';
import { CalendarClock, ShieldX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/features/auth/hooks';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { homeAfterSignIn, PORTAL_ROOT } from '@/lib/nav';
import { useCan, useSession, useSessionHydrated } from '@/lib/session';
import { AccountShell } from '@/features/account/account-shell';
import { PortalShell } from './portal-shell';

const audienceOf = (portal: Portal) => (portal === 'account' ? 'customer' : 'staff');
const loginPathOf = (portal: Portal) => (portal === 'account' ? '/account/login' : '/login');

/**
 * Portal-level guard (FRONTEND_ARCHITECTURE §3):
 *  - not signed in (or wrong audience) → sign-in page with `next`
 *  - signed in for another portal → that portal's home
 *  - otherwise re-validates the session with the backend (expiry, revocation, demo reset) and renders the shell.
 * UX only — every operation is authorised again server-side.
 */
export function PortalGuard({ portal, children }: { portal: Portal; children: ReactNode }) {
  const hydrated = useSessionHydrated();
  const session = useSession((s) => s.session);
  const router = useRouter();
  const pathname = usePathname();
  const allowed = hydrated && session !== null && session.user.userType === audienceOf(portal) && session.portal === portal;
  useMe(allowed);

  // A customer who signs out from an account page goes to the storefront home, not back to the sign-in page.
  const hadSession = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (session) hadSession.current = true;
    if (!session && portal === 'account' && hadSession.current) {
      router.replace('/');
    } else if (!session || session.user.userType !== audienceOf(portal)) {
      router.replace(`${loginPathOf(portal)}?next=${encodeURIComponent(pathname)}`);
    } else if (session.portal !== portal) {
      router.replace(homeAfterSignIn(session.portal));
    }
  }, [hydrated, session, portal, pathname, router]);

  if (!allowed) {
    return (
      <div className="flex flex-col gap-3 p-8" role="status" aria-busy="true">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  // Customers use the storefront layout with account navigation; business portals keep their dashboard shell.
  return portal === 'account' ? <AccountShell>{children}</AccountShell> : <PortalShell portal={portal}>{children}</PortalShell>;
}

export function Forbidden() {
  const t = useTranslations('auth');
  const portal = useSession((s) => s.session?.portal) ?? 'account';
  return (
    <div role="alert" data-testid="forbidden" className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-bg text-danger">
        <ShieldX className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold text-fg">{t('forbiddenTitle')}</h1>
      <p className="text-sm text-fg-muted">{t('forbiddenBody')}</p>
      <Link href={PORTAL_ROOT[portal]} className={buttonVariants({ variant: 'outline' })}>
        {t('goHome')}
      </Link>
    </div>
  );
}

/** Route/action-level guard: renders children only with the permission; otherwise the Forbidden state. */
export function RequirePermission({ permission, children }: { permission?: Permission; children: ReactNode }) {
  return useCan(permission) ? <>{children}</> : <Forbidden />;
}

/** Hides an action the user may not perform (the server would refuse it anyway). */
export function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  return useCan(permission) ? <>{children}</> : null;
}

/** A navigable, access-controlled area whose screens are delivered in a later milestone of the agreed roadmap. */
export function PlannedFeature({ feature, milestone }: { feature: string; milestone: number }) {
  const t = useTranslations('auth');
  return (
    <div data-testid="planned-feature" className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft">
        <CalendarClock className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold text-fg">{t('plannedTitle', { feature, milestone })}</h1>
      <p className="text-sm text-fg-muted">{t('plannedBody')}</p>
    </div>
  );
}
