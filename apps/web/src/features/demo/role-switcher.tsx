'use client';

import type { DemoAccount } from '@travelta/schemas';
import { Check, UserCog } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoAccounts, useDemoLoginAs } from '@/features/auth/hooks';
import { useRouter } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/errors';
import { homeAfterSignIn } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

const ORDER: DemoAccount['orgType'][] = ['platform', 'agency', 'supplier'];

/**
 * Demo panel → "Switch role": one click signs in as any demo account (the server issues a real session for it)
 * and opens that account's portal. Prototype-only (demo.loginAs is a demoOnly operation).
 */
export function RoleSwitcher({ onSwitched }: { onSwitched: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const accounts = useDemoAccounts(true);
  const loginAs = useDemoLoginAs();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const currentEmail = useSession((s) => s.session?.user.email);

  if (accounts.isLoading) return <Skeleton className="h-40 w-full" />;
  const staff = [...(accounts.data ?? [])].filter((a) => a.audience === 'staff').sort((a, b) => ORDER.indexOf(a.orgType) - ORDER.indexOf(b.orgType));
  const customers = (accounts.data ?? []).filter((a) => a.audience === 'customer');

  const switchTo = (a: DemoAccount) =>
    loginAs.mutate(
      { email: a.email, audience: a.audience },
      {
        onSuccess: (session) => {
          toast.success(t('demo.signedInAs', { name: session.user.name }));
          onSwitched();
          router.push(homeAfterSignIn(session.portal));
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4 md:col-span-2" aria-labelledby="role-switcher-title">
      <h3 id="role-switcher-title" className="flex items-center gap-2 font-semibold text-fg">
        <UserCog className="size-4 text-primary" aria-hidden />
        {t('demo.switchRole')}
      </h3>
      <p className="-mt-1 text-sm text-fg-muted">{t('demo.switchRoleHelp')}</p>
      <ul className="grid gap-1 sm:grid-cols-2" data-testid="role-switcher">
        {[...staff, ...customers].map((a) => {
          const current = a.email === currentEmail;
          return (
            <li key={a.email}>
              <button
                type="button"
                data-email={a.email}
                disabled={loginAs.isPending || current}
                onClick={() => switchTo(a)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-start text-sm transition-colors disabled:cursor-default',
                  current ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-subtle',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{a.name}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {a.roleKey === 'customer' ? t('enums.userType.customer') : t(`enums.orgType.${a.orgType}`)} · {a.orgName[locale]}
                  </span>
                </span>
                {current && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-on-primary-soft">
                    <Check className="size-3.5" aria-hidden />
                    {t('demo.current')}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
