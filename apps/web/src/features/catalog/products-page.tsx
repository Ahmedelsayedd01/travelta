'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES } from '@travelta/contracts';
import type { ProductListItem } from '@travelta/schemas';
import { formatMoney, money } from '@travelta/shared';
import { Archive, ArchiveRestore, CalendarRange, Pause, Pencil, Play, Plus, Star, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { ProductThumb } from '@/components/brand/product-thumb';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { useRouter } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { PORTAL_ROOT } from '@/lib/nav';
import { useCan, useSession } from '@/lib/session';
import { ProductEditor } from './product-editor';

const STATUS_TONE = { draft: 'neutral', live: 'success', paused: 'warning', archived: 'danger' } as const;
const STATUSES = ['live', 'draft', 'paused', 'archived'] as const;
type Status = (typeof STATUSES)[number];

/**
 * Supplier "Products", agency "Inventory" and platform "Catalog" — same list, scoped server-side.
 * The platform manages every product on behalf of its owner; suppliers and agencies only their own.
 */
export function ProductsPage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const router = useRouter();
  const session = useSession((s) => s.session);
  const orgType = session?.organization.type;
  const canManage = useCan('inventory.manage');
  const state = useListState({ sort: 'name:asc' });
  const result = useQuery({ queryKey: ['catalog', state.query], queryFn: () => api.call('catalog.list', state.query), placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const setStatus = useAction((i: { id: string; status: Status }) => api.call('catalog.setStatus', i), { success: t('catalog.statusChanged'), invalidate: [['catalog'], ['search']] });
  const [deleting, setDeleting] = useState<ProductListItem | null>(null);
  const remove = useAction((id: string) => api.call('catalog.delete', { id }), { success: t('catalog.deleted'), invalidate: [['catalog'], ['search']], onSuccess: () => setDeleting(null) });
  const statusLabel = (s: Status) => t(`catalog.status${s.charAt(0).toUpperCase()}${s.slice(1)}` as never);

  const titleKey = orgType === 'platform' ? 'catalog' : orgType === 'agency' ? 'inventory' : 'products';
  const ratesPath = `${PORTAL_ROOT[session?.portal ?? 'supplier']}/rates`;
  const columns: Column<ProductListItem>[] = [
    { key: 'name', header: t('catalog.name'), sortKey: 'name', cell: (p) => (
      <div className="flex items-center gap-3">
        <ProductThumb serviceType={p.serviceType} seed={p.imageSeed} className="size-11 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-medium">{p.name[locale]}</p>
          <p className="truncate text-xs text-fg-muted">{p.destinationName[locale]}</p>
        </div>
      </div>
    ) },
    { key: 'service', header: t('catalog.service'), cell: (p) => <Badge tone="primary">{t(`enums.serviceType.${p.serviceType}`)}</Badge> },
    ...(orgType === 'platform' ? [{ key: 'owner', header: t('catalog.owner'), cell: (p: ProductListItem) => p.ownerName[locale] } satisfies Column<ProductListItem>] : []),
    { key: 'units', header: t('catalog.units'), numeric: true, hideOnCard: true, cell: (p) => p.unitCount },
    { key: 'price', header: t('catalog.fromPrice'), sortKey: 'price', numeric: true, cell: (p) => formatMoney(money(p.fromNetMinor, p.currency), locale) },
    { key: 'rating', header: t('catalog.rating'), sortKey: 'rating', hideOnCard: true, cell: (p) => <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-highlight text-highlight" aria-hidden />{p.rating.toFixed(1)}</span> },
    { key: 'status', header: t('catalog.status'), cell: (p) => <Badge tone={STATUS_TONE[p.status]} dot>{statusLabel(p.status)}</Badge> },
  ];

  return (
    <>
      <PageHeader title={t(`catalog.${titleKey}Title` as never)} description={t(`catalog.${titleKey}Description` as never)}
        actions={canManage && <Button onClick={() => setEditing('new')} data-testid="new-product"><Plus aria-hidden />{t('catalog.newProduct')}</Button>} />
      <DataTable label={t('catalog.name')} testId="products-table" state={state} result={result} columns={columns} rowKey={(p) => p.id}
        onRowClick={canManage ? (p) => { if (p.status !== 'archived') setEditing(p.id); } : undefined}
        filters={[
          { key: 'service', label: t('catalog.service'), options: SERVICE_TYPES.map((v) => ({ value: v, label: t(`enums.serviceType.${v}`) })) },
          { key: 'status', label: t('catalog.status'), options: STATUSES.map((v) => ({ value: v, label: statusLabel(v) })) },
        ]}
        rowActions={canManage ? (p) => (
          <div className="flex justify-end gap-1" data-testid="product-actions">
            {p.status === 'archived' ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: p.id, status: 'draft' })} data-testid="restore-product"><ArchiveRestore aria-hidden />{t('catalog.restore')}</Button>
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleting(p)} aria-label={t('common.delete')} data-testid="delete-product"><Trash2 aria-hidden /></Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditing(p.id)} aria-label={t('common.edit')} data-testid="edit-product"><Pencil aria-hidden /></Button>
                <Button variant="ghost" size="sm" onClick={() => router.push(`${ratesPath}?product=${p.id}`)}><CalendarRange aria-hidden />{t('catalog.rates')}</Button>
                {p.status === 'live'
                  ? <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: p.id, status: 'paused' })} data-testid="pause-product"><Pause aria-hidden />{t('catalog.pause')}</Button>
                  : <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: p.id, status: 'live' })} data-testid="publish-product"><Play aria-hidden />{t('catalog.publish')}</Button>}
                <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: p.id, status: 'archived' })} aria-label={t('catalog.archive')} data-testid="archive-product"><Archive aria-hidden /></Button>
              </>
            )}
          </div>
        ) : undefined}
        empty={<EmptyState title={t(`catalog.${titleKey}Title` as never)} body={t(`catalog.${titleKey}Description` as never)} />} />
      {editing && <ProductEditor productId={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }} loading={remove.isPending}
        title={t('catalog.deleteTitle', { name: deleting?.name[locale] ?? '' })} description={t('catalog.deleteBody')} confirmLabel={t('common.delete')}
        onConfirm={() => { if (deleting) remove.mutate(deleting.id); }} />
    </>
  );
}
