'use client';

import { permissionModule, type Permission } from '@travelta/contracts';
import { Building2, KeyRound, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/data/status-badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Can } from '@/components/portal/guards';
import { useSession } from '@/lib/session';
import { TeamList } from './team-list';
import { BusinessDashboard } from '@/features/reports/dashboard';

/** Portal home for staff: business dashboard (reports.view), then identity, organization, permissions and team. */
export function PortalHome() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const session = useSession((s) => s.session);
  if (!session) return null;

  const modules = session.permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[permissionModule(p)] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg" data-testid="portal-welcome">{t('auth.welcomeBack', { name: session.user.name.split(' ')[0] ?? session.user.name })}</h1>
        <p className="text-fg-muted">{session.organization.name[locale]}</p>
      </div>

      {session.permissions.includes('reports.view') && <BusinessDashboard />}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex items-start gap-3 p-5">
          <UserRound className="mt-0.5 size-5 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm text-fg-muted">{t('auth.signedInAs')}</p>
            <p className="truncate font-semibold text-fg">{session.user.name}</p>
            <p className="truncate text-sm text-fg-muted" dir="ltr">{session.user.email}</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-5">
          <Building2 className="mt-0.5 size-5 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm text-fg-muted">{t('auth.organization')}</p>
            <p className="truncate font-semibold text-fg" data-testid="org-name">{session.organization.name[locale]}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone="neutral">{t(`enums.orgType.${session.organization.type}`)}</Badge>
              <StatusBadge kind="orgStatus" value={session.organization.status} />
            </div>
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-5">
          <KeyRound className="mt-0.5 size-5 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm text-fg-muted">{t('auth.role')}</p>
            <p className="truncate font-semibold text-fg" data-testid="role-name">{session.role?.name[locale]}</p>
            <p className="text-sm text-fg-muted" data-testid="permission-count">{t('auth.permissionsCount', { count: session.permissions.length })}</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t('auth.yourAccess')} description={t('auth.permissionsCount', { count: session.permissions.length })} />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(modules).sort(([a], [b]) => a.localeCompare(b)).map(([module, perms]) => (
            <div key={module}>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">{module.replace('_', ' ')}</p>
              <div className="flex flex-wrap gap-1">
                {perms.map((p) => (
                  <code key={p} dir="ltr" className="rounded-sm bg-subtle px-1.5 py-0.5 text-xs text-fg">{p.slice(module.length + 1)}</code>
                ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Can permission="team.view">
        <Card>
          <CardHeader title={t('auth.team')} />
          <CardBody>
            <TeamList pageSize={5} />
          </CardBody>
        </Card>
      </Can>
    </div>
  );
}

/** Customer account home (bookings, vouchers and profile screens arrive with Milestone 21). */
export function AccountHome() {
  const t = useTranslations('auth');
  const session = useSession((s) => s.session);
  if (!session) return null;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-fg" data-testid="portal-welcome">{t('myAccountWelcome', { name: session.user.name.split(' ')[0] ?? session.user.name })}</h1>
      <Card className="p-5">
        <p className="text-fg-muted">{t('myAccountBody')}</p>
        <p className="mt-3 text-sm" dir="ltr">{session.user.email}</p>
      </Card>
    </div>
  );
}
