'use client';

import { Menu } from '@base-ui/react/menu';
import { useQuery } from '@tanstack/react-query';
import { LogIn, LogOut, UserPlus, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { useLogout } from '@/features/auth/hooks';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { useSession, useSessionHydrated } from '@/lib/session';
import { ACCOUNT_SECTIONS } from './account-nav';

const itemClass = 'flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg outline-none select-none data-highlighted:bg-primary-soft data-highlighted:text-on-primary-soft';
const popupClass = cn('min-w-60 rounded-xl border border-border bg-surface-raised p-1.5 shadow-lg outline-none',
  'origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0');

/** Initials avatar (no photo upload in the prototype). */
function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return <span aria-hidden className={cn('flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary', className)}>{initials || <UserRound className="size-4" />}</span>;
}

function UnreadCount() {
  const api = useApi();
  const token = useSession((s) => s.token);
  const q = useQuery({ queryKey: ['notifications', 'unread', token], queryFn: () => api.call('notifications.list', { page: 1, pageSize: 1, filters: { unread: 'true' } }), refetchInterval: 60_000 });
  const n = q.data?.unread ?? 0;
  return n > 0 ? <span className="ms-auto rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white dark:text-canvas" data-testid="menu-unread">{n}</span> : null;
}

/**
 * Storefront header account control. Signed out: a profile button offering Sign in / Create account.
 * Signed in as a customer: avatar menu with name, email, every account section and Sign out (existing logout flow).
 */
export function ProfileMenu() {
  const t = useTranslations('account');
  const ta = useTranslations('auth');
  const hydrated = useSessionHydrated();
  const session = useSession((s) => s.session);
  const logout = useLogout();
  const router = useRouter();
  if (!hydrated) return <span className="size-10" />;
  const customer = session?.user.userType === 'customer' ? session : null;

  if (!customer) {
    return (
      <Menu.Root>
        <Menu.Trigger className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong px-1.5 text-sm font-medium text-fg hover:bg-subtle sm:pe-3" data-testid="profile-menu-trigger">
          <span className="flex size-7 items-center justify-center rounded-full bg-subtle"><UserRound className="size-4" aria-hidden /></span>
          <span className="sr-only sm:not-sr-only">{ta('signIn')}</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={8} align="end" className="z-50">
            <Menu.Popup className={popupClass} data-testid="profile-menu">
              <p className="px-2.5 pt-1.5 pb-2 text-xs text-fg-muted">{t('signedOutHint')}</p>
              <Menu.Item className={itemClass} render={<Link href="/account/login" data-testid="menu-sign-in" />}><LogIn className="flip-rtl size-4" aria-hidden />{ta('signIn')}</Menu.Item>
              <Menu.Item className={itemClass} render={<Link href="/account/register" data-testid="menu-register" />}><UserPlus className="size-4" aria-hidden />{ta('register')}</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger className="inline-flex h-10 items-center gap-2 rounded-full p-1 hover:bg-subtle" data-testid="profile-menu-trigger">
        <Avatar name={customer.user.name} />
        <span className="sr-only">{t('accountMenuFor', { name: customer.user.name })}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup className={popupClass} data-testid="profile-menu">
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar name={customer.user.name} className="size-10 text-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg" data-testid="menu-name">{customer.user.name}</p>
                <p className="truncate text-xs text-fg-muted" dir="ltr" data-testid="menu-email">{customer.user.email}</p>
              </div>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            {ACCOUNT_SECTIONS.map(({ key, path, label, icon: Icon }) => (
              <Menu.Item key={key} className={itemClass} render={<Link href={path} data-testid={`menu-${key}`} />}>
                <Icon className="size-4 text-fg-muted" aria-hidden />{t(label as never)}{key === 'notifications' && <UnreadCount />}
              </Menu.Item>
            ))}
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item className={itemClass} data-testid="menu-sign-out"
              onClick={() => logout.mutate(undefined, { onSettled: () => { toast.success(ta('signedOut')); router.replace('/'); } })}>
              <LogOut className="flip-rtl size-4" aria-hidden />{ta('signOut')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
