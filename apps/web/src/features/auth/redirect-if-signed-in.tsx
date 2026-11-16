'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from '@/i18n/navigation';
import { PORTAL_ROOT, safeNext } from '@/lib/nav';
import { useSession, useSessionHydrated } from '@/lib/session';

/**
 * A visitor who is ALREADY signed in (for this audience) when the sign-in/registration page loads is sent on
 * to `?next` or their portal. Decided once, when the stored session is first available: a sign-in that happens
 * on this page is handled by the form itself, so the two redirects never race.
 */
export function RedirectIfSignedIn({ audience, children }: { audience: 'staff' | 'customer'; children: ReactNode }) {
  const hydrated = useSessionHydrated();
  const session = useSession((s) => s.session);
  const router = useRouter();
  const params = useSearchParams();
  const [arrival, setArrival] = useState<{ portal: NonNullable<typeof session>['portal'] } | 'anonymous' | null>(null);

  // Record the arrival state once (state adjustment during render, per React's guidance — no effect needed).
  if (hydrated && arrival === null) {
    setArrival(session !== null && session.user.userType === audience ? { portal: session.portal } : 'anonymous');
  }

  useEffect(() => {
    if (arrival && arrival !== 'anonymous') router.replace(safeNext(params.get('next'), arrival.portal) ?? PORTAL_ROOT[arrival.portal]);
  }, [arrival, params, router]);

  return arrival === 'anonymous' ? <>{children}</> : null;
}
