'use client';

import type { Portal } from '@travelta/contracts';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { PORTAL_ROOT, visibleNav } from '@/lib/nav';
import { usePermissions } from '@/lib/session';
import { useSubscriptionAccess } from '@/features/subscriptions/hooks';
import { cn } from '@/lib/cn';

/** Permission-filtered navigation for the active portal (shared by the desktop sidebar and the mobile drawer). */
export function SidebarNav({ portal, onNavigate }: { portal: Portal; onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const permissions = usePermissions();
  const access = useSubscriptionAccess();
  const root = PORTAL_ROOT[portal];

  return (
    <nav aria-label={t('groupMain')} className="flex flex-col gap-5">
      {visibleNav(portal, permissions, access.data).map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-nav-muted uppercase">{t(group.label as never)}</p>
          {group.items.map((item) => {
            const href = item.path ? `${root}/${item.path}` : root;
            const active = item.path ? pathname === href || pathname.startsWith(`${href}/`) : pathname === root;
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                data-nav-key={item.key}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-nav-active text-on-nav-active' : 'text-nav-fg hover:bg-white/10',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{t(item.label as never)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
