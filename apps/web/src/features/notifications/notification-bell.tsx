'use client';

import { Popover } from '@base-ui/react/popover';
import { useQuery } from '@tanstack/react-query';
import type { NotificationEntity } from '@travelta/schemas';
import { Bell, CheckCheck } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { useDemoNow } from '@/features/demo/hooks';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/mutations';
import { PORTAL_ROOT } from '@/lib/nav';
import { useSession } from '@/lib/session';

const DOT = { info: 'bg-info', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' } as const;

export function useNotifications(pageSize = 8) {
  const api = useApi();
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ['notifications', 'bell', token, pageSize], queryFn: () => api.call('notifications.list', { page: 1, pageSize }), enabled: token !== null, refetchInterval: 20_000 });
}

export function NotificationItem({ n, onOpen }: { n: NotificationEntity; onOpen: (n: NotificationEntity) => void }) {
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const now = useDemoNow();
  return (
    <button type="button" onClick={() => onOpen(n)} data-testid="notification" data-unread={n.readAt === null}
      className={cn('flex w-full gap-3 rounded-md px-3 py-2.5 text-start hover:bg-subtle', n.readAt === null && 'bg-primary-soft/30')}>
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt === null ? DOT[n.severity] : 'bg-transparent')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{n.title[locale]}</span>
        <span className="line-clamp-2 block text-xs text-fg-muted">{n.body[locale]}</span>
        <span className="mt-0.5 block text-[11px] text-fg-subtle">{format.relativeTime(new Date(n.at), now)}</span>
      </span>
    </button>
  );
}

/** Header bell (M19): unread count, latest notifications, mark read, deep links. */
export function NotificationBell() {
  const t = useTranslations('notifications');
  const api = useApi();
  const router = useRouter();
  const portal = useSession((s) => s.session?.portal) ?? 'agency';
  const q = useNotifications();
  const [isOpen, setOpen] = useState(false);
  const unread = q.data?.unread ?? 0;
  const markAll = useAction(() => api.call('notifications.markRead', { all: true }), { invalidate: [['notifications']] });
  const markOne = useAction((id: string) => api.call('notifications.markRead', { ids: [id] }), { invalidate: [['notifications']] });
  const open = (n: NotificationEntity) => {
    setOpen(false);
    if (n.readAt === null) markOne.mutate(n.id);
    if (n.link) router.push(n.link);
  };
  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger className="relative inline-flex size-10 items-center justify-center rounded-md text-fg hover:bg-subtle" aria-label={t('bell', { n: unread })} data-testid="notification-bell">
        <Bell className="size-5" aria-hidden />
        {unread > 0 && <span className="absolute -end-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white dark:text-canvas" data-testid="notif-count">{unread > 99 ? '99+' : unread}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className="flex max-h-[70dvh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg" data-testid="notification-panel">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <Popover.Title className="text-sm font-semibold">{t('title')}</Popover.Title>
              {unread > 0 && <Button size="sm" variant="ghost" onClick={() => markAll.mutate()} data-testid="mark-all-read"><CheckCheck aria-hidden />{t('markAll')}</Button>}
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              {(q.data?.items ?? []).length === 0 ? <p className="px-3 py-8 text-center text-sm text-fg-muted">{t('empty')}</p>
                : q.data!.items.map((n) => <NotificationItem key={n.id} n={n} onOpen={open} />)}
            </div>
            <Link href={`${PORTAL_ROOT[portal]}/notifications`} onClick={() => setOpen(false)} className="border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-subtle" data-testid="all-notifications">{t('viewAll')}</Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
