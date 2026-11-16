'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ORG_STATUSES, ORG_TYPES } from '@travelta/contracts';
import type { OrganizationDto } from '@travelta/schemas';
import { Ban, Pencil, RotateCcw } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { Can } from '@/components/portal/guards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet } from '@/components/ui/sheet';
import { OrganizationProfileForm } from '@/features/settings/settings-page';
import { useAction } from '@/lib/mutations';

/** Platform → Organizations: every tenant, with suspend / reactivate (orgs.setStatus — audited, ends sessions). */
export function OrganizationsPage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const api = useApi();
  const state = useListState({ pageSize: 10, sort: 'name:asc' });
  const result = useQuery({ queryKey: ['orgs', state.query], queryFn: () => api.call('orgs.list', state.query), placeholderData: keepPreviousData });
  const [selected, setSelected] = useState<OrganizationDto | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ org: OrganizationDto; status: 'active' | 'suspended' } | null>(null);
  const [reason, setReason] = useState('');
  const setStatus = useAction((input: { id: string; status: 'active' | 'suspended'; reason: string }) => api.call('orgs.setStatus', input), {
    success: (o) => t(o.status === 'suspended' ? 'org.suspended' : 'org.reactivated', { name: o.name[locale] }),
    invalidate: [['orgs']],
    onSuccess: (o) => { setStatusTarget(null); setReason(''); setSelected((s) => (s?.id === o.id ? o : s)); },
  });

  const columns: Column<OrganizationDto>[] = [
    { key: 'name', header: t('org.name'), sortKey: 'name', cell: (o) => (
      <div className="min-w-0">
        <p className="font-medium">{o.name[locale]}</p>
        {o.parentName && <p className="text-xs text-fg-muted">↳ {o.parentName[locale]}</p>}
      </div>
    ) },
    { key: 'type', header: t('org.type'), cell: (o) => <Badge tone={o.type === 'supplier' ? 'accent' : o.type === 'platform' ? 'primary' : 'neutral'}>{t(`enums.orgType.${o.type}`)}</Badge> },
    { key: 'city', header: t('org.city'), cell: (o) => o.city, hideOnCard: true },
    { key: 'status', header: t('org.status'), sortKey: 'status', cell: (o) => <StatusBadge kind="orgStatus" value={o.status} /> },
    { key: 'kyc', header: t('org.kyc'), cell: (o) => <StatusBadge kind="kycCaseStatus" value={o.kycStatus} /> },
    { key: 'members', header: t('org.members'), numeric: true, cell: (o) => o.memberCount },
    { key: 'created', header: t('org.created'), sortKey: 'createdAt', hideOnCard: true, cell: (o) => format.dateTime(new Date(o.createdAt), { dateStyle: 'medium' }) },
  ];

  const statusActions = (o: OrganizationDto) =>
    o.type === 'platform' ? null : o.status === 'suspended' ? (
      <Button variant="outline" size="sm" onClick={() => setStatusTarget({ org: o, status: 'active' })}><RotateCcw aria-hidden />{t('org.reactivate')}</Button>
    ) : (
      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setStatusTarget({ org: o, status: 'suspended' })}><Ban aria-hidden />{t('org.suspend')}</Button>
    );

  return (
    <>
      <PageHeader title={t('org.title')} description={t('org.description')} />
      <DataTable
        label={t('org.title')}
        testId="orgs-table"
        state={state}
        result={result}
        columns={columns}
        rowKey={(o) => o.id}
        onRowClick={setSelected}
        filters={[
          { key: 'type', label: t('org.type'), options: ORG_TYPES.map((v) => ({ value: v, label: t(`enums.orgType.${v}`) })) },
          { key: 'status', label: t('org.status'), options: ORG_STATUSES.map((v) => ({ value: v, label: t(`enums.orgStatus.${v}`) })) },
        ]}
        rowActions={(o) => <Can permission="organizations.manage">{statusActions(o)}</Can>}
      />

      <Sheet open={selected !== null} onOpenChange={(o) => { if (!o) { setSelected(null); setEditingProfile(false); } }} title={selected?.name[locale]} description={selected?.legalName}
        footer={selected && <Can permission="organizations.manage">
          {!editingProfile && selected.type !== 'platform' && <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)} data-testid="edit-org"><Pencil aria-hidden />{t('common.edit')}</Button>}
          {statusActions(selected)}
        </Can>}>
        {selected && editingProfile && <OrganizationProfileForm target={selected} onSaved={() => { setEditingProfile(false); setSelected(null); }} />}
        {selected && !editingProfile && (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            {[
              [t('org.type'), t(`enums.orgType.${selected.type}`)],
              [t('org.status'), <StatusBadge key="s" kind="orgStatus" value={selected.status} />],
              [t('org.kyc'), <StatusBadge key="k" kind="kycCaseStatus" value={selected.kycStatus} />],
              [t('org.parent'), selected.parentName?.[locale] ?? t('org.none')],
              [t('org.city'), `${selected.city}, ${selected.countryIso2}`],
              [t('org.currency'), selected.baseCurrency],
              [t('org.slug'), <code key="slug" dir="ltr">{selected.slug}</code>],
              [t('org.members'), selected.memberCount],
              [t('org.contact'), <span key="c" dir="ltr">{selected.contactEmail}<br />{selected.contactPhone}</span>],
              [t('org.services'), selected.serviceTypes.length ? selected.serviceTypes.map((s) => t(`enums.serviceType.${s}`)).join(' · ') : t('org.none')],
            ].map(([label, value], i) => (
              <div key={i}>
                <dt className="text-fg-muted">{label}</dt>
                <dd className="mt-0.5 font-medium text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Sheet>

      <Dialog
        open={statusTarget !== null}
        onOpenChange={(o) => !o && setStatusTarget(null)}
        size="sm"
        title={statusTarget ? t(statusTarget.status === 'suspended' ? 'org.suspendTitle' : 'org.reactivateTitle', { name: statusTarget.org.name[locale] }) : ''}
        description={statusTarget ? t(statusTarget.status === 'suspended' ? 'org.suspendBody' : 'org.reactivateBody') : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant={statusTarget?.status === 'suspended' ? 'danger' : 'primary'}
              disabled={reason.trim().length === 0}
              loading={setStatus.isPending}
              onClick={() => statusTarget && setStatus.mutate({ id: statusTarget.org.id, status: statusTarget.status, reason: reason.trim() })}
            >
              {statusTarget?.status === 'suspended' ? t('org.suspend') : t('org.reactivate')}
            </Button>
          </>
        }
      >
        <Field label={t('org.reason')} required help={t('org.reasonHelp')}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
      </Dialog>
    </>
  );
}
