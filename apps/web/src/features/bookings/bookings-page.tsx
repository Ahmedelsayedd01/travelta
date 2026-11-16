'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES } from '@travelta/contracts';
import type { BoardItem, BookingListItem } from '@travelta/schemas';
import { AlarmClock, Columns3, List, Ticket } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { createContext, useContext, useState } from 'react';
import { useApi } from '@/components/api-provider';
import { SERVICE_ICONS } from '@/components/brand/brand';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { priceOf } from '@/features/search/format';
import { useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';
import { ItemActions, type ActionRenderers } from './item-actions';

export const PORTAL_BOOKINGS: Record<string, string> = { platform: '/admin/bookings', agency: '/agency/bookings', supplier: '/supplier/reservations', customer: '/account/bookings' };

/** Branded storefronts (M22) serve customer bookings under `/s/<slug>/bookings`. */
export const BookingsBaseContext = createContext<string | null>(null);

/** Where this session's bookings live: customers use their account (or the branded store), staff their portal. */
export function useBookingsBase(): string {
  const branded = useContext(BookingsBaseContext);
  const session = useSession((s) => s.session);
  if (branded) return branded;
  if (session?.user.userType === 'customer') return PORTAL_BOOKINGS.customer!;
  return PORTAL_BOOKINGS[session?.organization.type ?? 'agency']!;
}

export function useDateFormat() {
  const format = useFormatter();
  return (iso: string) => format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Bookings (W5): list with filters, and the operations board with per-item actions. Suppliers see the board only. */
export function BookingsPage({ extraActions }: { extraActions?: ActionRenderers }) {
  const t = useTranslations('bookings');
  const orgType = useSession((s) => s.session?.organization.type) ?? 'agency';
  const supplier = orgType === 'supplier';
  const base = useBookingsBase();
  const customer = base === PORTAL_BOOKINGS.customer;
  const [view, setView] = useState<'list' | 'board'>(supplier ? 'board' : 'list');
  const title = customer ? t('myTitle') : supplier ? t('reservationsTitle') : orgType === 'platform' ? t('adminTitle') : t('title');
  const description = customer ? t('myDescription') : supplier ? t('reservationsDescription') : orgType === 'platform' ? t('adminDescription') : t('description');
  return (
    <>
      <PageHeader title={title} description={description} actions={!supplier && !customer && (
        <div role="tablist" className="flex gap-1 rounded-lg bg-subtle p-1">
          {([['list', List, t('viewList')], ['board', Columns3, t('viewBoard')]] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} data-view={v}
              className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', view === v ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg')}>
              <Icon className="size-4" aria-hidden />{label}
            </button>
          ))}
        </div>
      )} />
      {view === 'list' ? <BookingsList base={base} /> : <OpsBoard base={base} extraActions={extraActions} />}
    </>
  );
}

function BookingsList({ base }: { base: string }) {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const router = useRouter();
  const date = useDateFormat();
  const state = useListState({ pageSize: 10, sort: 'createdAt:desc' });
  const result = useQuery({ queryKey: ['bookings', 'list', state.query], queryFn: () => api.call('bookings.list', state.query), placeholderData: keepPreviousData });
  const columns: Column<BookingListItem>[] = [
    { key: 'ref', header: t('bookings.ref'), sortKey: 'ref', cell: (b) => (
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold" dir="ltr">{b.ref}</p>
        <p className="truncate text-xs text-fg-muted">{b.title[locale]}</p>
      </div>
    ) },
    { key: 'customer', header: t('bookings.customer'), cell: (b) => (
      <div className="min-w-0"><p className="truncate">{b.customerName ?? '—'}</p><p className="truncate text-xs text-fg-muted">{b.leadTraveller}</p></div>
    ) },
    { key: 'services', header: t('bookings.services'), hideOnCard: true, cell: (b) => (
      <div className="flex gap-1">{b.services.map((s) => { const Icon = SERVICE_ICONS[s]; return <Icon key={s} className="size-4 text-fg-muted" aria-label={t(`enums.serviceType.${s}`)} />; })}</div>
    ) },
    { key: 'travel', header: t('bookings.travel'), sortKey: 'travelStart', cell: (b) => <span className="tabular whitespace-nowrap text-sm">{date(b.travelStart)}</span> },
    { key: 'status', header: t('bookings.status'), cell: (b) => (
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge kind="bookingStatus" value={b.status} />
        {b.overdueConfirmation && <Badge tone="danger" title={t('bookings.overdueHint')}><AlarmClock className="size-3" aria-hidden />{t('bookings.overdue')}</Badge>}
      </div>
    ) },
    { key: 'payment', header: t('bookings.payment'), hideOnCard: true, cell: (b) => <StatusBadge kind="bookingPaymentStatus" value={b.paymentStatus} /> },
    { key: 'total', header: t('bookings.total'), sortKey: 'total', numeric: true, cell: (b) => <span className="tabular font-medium">{priceOf(b.totalMinor, b.currency, locale)}</span> },
  ];
  return (
    <DataTable state={state} result={result} columns={columns} rowKey={(b) => b.id} label={t('bookings.title')} testId="bookings-table"
      onRowClick={(b) => router.push(`${base}/${b.id}`)}
      empty={<EmptyState icon={<Ticket aria-hidden />} title={t('bookings.noBookings')} body={t('bookings.noBookingsBody')} />}
      filters={[
        { key: 'status', label: t('bookings.status'), options: (['pending', 'partially_confirmed', 'confirmed', 'vouchered', 'travelled', 'cancelled'] as const).map((s) => ({ value: s, label: t(`enums.bookingStatus.${s}`) })) },
        { key: 'service', label: t('bookings.services'), options: SERVICE_TYPES.map((s) => ({ value: s, label: t(`enums.serviceType.${s}`) })) },
        { key: 'when', label: t('bookings.when'), options: [{ value: 'upcoming', label: t('bookings.upcoming') }, { value: 'current', label: t('bookings.current') }, { value: 'past', label: t('bookings.past') }] },
        { key: 'overdue', label: t('bookings.overdue'), options: [{ value: 'true', label: t('bookings.overdue') }] },
      ]} />
  );
}

const COLUMNS: { key: string; statuses: BoardItem['status'][] }[] = [
  { key: 'colPending', statuses: ['pending'] },
  { key: 'colConfirmed', statuses: ['confirmed'] },
  { key: 'colVouchered', statuses: ['vouchered'] },
  { key: 'colTravelled', statuses: ['travelled', 'no_show'] },
  { key: 'colClosed', statuses: ['cancelled', 'rejected'] },
];

function OpsBoard({ base, extraActions }: { base: string; extraActions?: ActionRenderers }) {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const router = useRouter();
  const date = useDateFormat();
  const [q, setQ] = useState('');
  const board = useQuery({ queryKey: ['bookings', 'board', q], queryFn: () => api.call('bookings.board', { page: 1, pageSize: 100, q: q || undefined, sort: 'from:asc' }), placeholderData: keepPreviousData });
  return (
    <div className="flex flex-col gap-4">
      <Input type="search" className="max-w-sm" placeholder={t('common.search')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {!board.data ? <Skeleton className="h-96 w-full" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" data-testid="ops-board">
          {COLUMNS.map((col) => {
            const rows = board.data.items.filter((r) => col.statuses.includes(r.status));
            return (
              <section key={col.key} className="flex min-w-0 flex-col gap-2 rounded-xl bg-subtle/60 p-3" data-column={col.key} aria-label={t(`bookings.${col.key}` as never)}>
                <h2 className="flex items-center justify-between px-1 text-sm font-semibold text-fg">{t(`bookings.${col.key}` as never)}<Badge tone="neutral">{rows.length}</Badge></h2>
                {rows.length === 0 && <p className="px-1 py-6 text-center text-xs text-fg-muted">{t('bookings.emptyColumn')}</p>}
                {rows.map((r) => {
                  const Icon = SERVICE_ICONS[r.serviceType];
                  return (
                    <article key={r.itemId} className={cn('flex flex-col gap-2 rounded-lg border bg-surface p-3 shadow-xs', r.overdueConfirmation ? 'border-danger/50' : 'border-border')} data-testid="board-card" data-ref={r.ref}>
                      <button type="button" className="flex items-start gap-2 text-start" onClick={() => router.push(`${base}/${r.bookingId}`)}>
                        <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0">
                          <span className="block font-mono text-xs font-semibold text-fg-muted" dir="ltr">{r.ref} · {r.seq}</span>
                          <span className="block truncate text-sm font-semibold text-fg">{r.title[locale]}</span>
                          <span className="block truncate text-xs text-fg-muted">{r.leadTraveller} · {date(r.from)}</span>
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-1">
                        {r.holdReason && <Badge tone="warning">{t(`enums.holdReason.${r.holdReason}`)}</Badge>}
                        {r.overdueConfirmation && <Badge tone="danger"><AlarmClock className="size-3" aria-hidden />{t('bookings.overdue')}</Badge>}
                        {r.status === 'rejected' && <Badge tone="danger">{t('enums.bookingItemStatus.rejected')}</Badge>}
                        {r.status === 'no_show' && <Badge>{t('enums.bookingItemStatus.no_show')}</Badge>}
                        <span className="tabular ms-auto text-xs font-medium text-fg">{priceOf(r.amountMinor, r.currency, locale)}</span>
                      </div>
                      <ItemActions target={{ bookingId: r.bookingId, itemId: r.itemId, title: r.title[locale], serviceType: r.serviceType }} actions={r.actions} extra={extraActions} />
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
