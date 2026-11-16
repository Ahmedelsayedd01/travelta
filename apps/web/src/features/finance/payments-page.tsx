'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CancellationListItem, OverdueRow, PaymentListItem } from '@travelta/schemas';
import { BellRing, CheckCircle2, CircleDollarSign, Coins, RotateCw, Undo2, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { useBookingsBase, useDateFormat } from '@/features/bookings/bookings-page';
import { priceOf } from '@/features/search/format';
import { useRouter } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { useBookingFinance } from './booking-finance';
import { CollectDialog, FINANCE_KEYS } from './collect-dialog';

type PaymentRow = PaymentListItem;

function CollectionsTable() {
  const t = useTranslations('finance');
  const te = useTranslations('enums');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const date = useDateFormat();
  const base = useBookingsBase();
  const state = useListState({ pageSize: 10, sort: 'receivedAt:desc' });
  const result = useQuery({ queryKey: ['payments', 'list', state.query], queryFn: () => api.call('payments.list', state.query), placeholderData: keepPreviousData });
  const columns: Column<PaymentRow>[] = [
    { key: 'receivedAt', header: t('date'), sortKey: 'receivedAt', cell: (p) => <span className="tabular whitespace-nowrap text-sm">{date(p.receivedAt)}</span> },
    { key: 'reference', header: t('reference'), cell: (p) => <div className="min-w-0"><p className="font-mono text-xs" dir="ltr">{p.reference}</p><p className="font-mono text-xs text-fg-muted" dir="ltr">{p.bookingRef}</p></div> },
    { key: 'customer', header: t('customer'), cell: (p) => <span className="text-sm">{p.customerName ?? '—'}</span> },
    { key: 'method', header: t('method'), hideOnCard: true, cell: (p) => <span className="text-sm">{te(`paymentMethod.${p.method}`)}{p.accountNames.length > 0 && <span className="text-fg-muted"> · {p.accountNames.join(' + ')}</span>}</span> },
    { key: 'amount', header: t('amount'), sortKey: 'amount', numeric: true, cell: (p) => <span className={p.direction === 'out' ? 'tabular font-medium text-danger' : 'tabular font-medium'}>{p.direction === 'out' ? '−' : ''}{priceOf(p.amountMinor, p.currency, locale)}</span> },
    { key: 'status', header: t('status'), cell: (p) => <StatusBadge kind="paymentStatus" value={p.status} /> },
  ];
  return (
    <DataTable state={state} result={result} columns={columns} rowKey={(p) => p.id} label={t('collections')} testId="payments-table"
      onRowClick={(p) => p.bookingId && router.push(`${base}/${p.bookingId}`)}
      filters={[
        { key: 'direction', label: t('direction'), options: [{ value: 'in', label: t('dirIn') }, { value: 'out', label: t('dirOut') }] },
        { key: 'status', label: t('status'), options: (['authorized', 'succeeded', 'voided'] as const).map((s) => ({ value: s, label: te(`paymentStatus.${s}`) })) },
      ]}
      empty={<EmptyState icon={<Coins aria-hidden />} title={t('noPayments')} />} />
  );
}

function CollectFromRow({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const fin = useBookingFinance(bookingId);
  if (!fin.data) return null;
  return <CollectDialog open onClose={onClose} finance={fin.data} />;
}

/** PAY-5 overdue board: open instalments due within 3 days or past due, by age, with remind and collect. */
function OverdueBoard() {
  const t = useTranslations('finance');
  const ti = useTranslations('enums');
  const locale = useLocale();
  const api = useApi();
  const date = useDateFormat();
  const state = useListState({ pageSize: 20, sort: 'dueDate:asc' });
  const result = useQuery({ queryKey: ['payments', 'overdue', state.query], queryFn: () => api.call('payments.overdue', state.query), placeholderData: keepPreviousData });
  const [collect, setCollect] = useState<string | null>(null);
  const remind = useAction((r: OverdueRow) => api.call('payments.remind', { bookingId: r.bookingId, seq: r.seq }), { success: t('reminderSent'), invalidate: [['payments']] });
  const totals = (result.data?.items ?? []).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.bucket]: (acc[r.bucket] ?? 0) + r.amountMinor - r.paidMinor }), {});
  const BUCKETS = ['due_soon', 'd0_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
  const columns: Column<OverdueRow>[] = [
    { key: 'ref', header: t('booking'), cell: (r) => <div><p className="font-mono text-sm font-semibold" dir="ltr">{r.ref}</p><p className="text-xs text-fg-muted">{r.customerName ?? '—'}</p></div> },
    { key: 'inst', header: t('installment'), cell: (r) => <span className="text-sm">{t('installmentOf', { n: r.seq, total: r.installments })}</span> },
    { key: 'dueDate', header: t('dueDate'), sortKey: 'dueDate', cell: (r) => <span className="tabular whitespace-nowrap text-sm">{date(r.dueDate)}</span> },
    { key: 'age', header: t('age'), sortKey: 'daysOverdue', cell: (r) => <Badge tone={r.bucket === 'due_soon' ? 'info' : r.daysOverdue > 30 ? 'danger' : 'warning'}>{r.bucket === 'due_soon' ? t('dueSoon') : t('daysLate', { n: r.daysOverdue })}</Badge> },
    { key: 'amount', header: t('open'), sortKey: 'amount', numeric: true, cell: (r) => <span className="tabular font-medium">{priceOf(r.amountMinor - r.paidMinor, r.currency, locale)}</span> },
    { key: 'status', header: t('status'), hideOnCard: true, cell: (r) => <div className="flex flex-wrap gap-1"><StatusBadge kind="installmentStatus" value={r.status} />{r.remindedAt && <Badge tone="neutral" title={r.remindedAt}><BellRing className="size-3" aria-hidden />{t('reminded')}</Badge>}</div> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5" data-testid="overdue-buckets">
        {BUCKETS.map((b) => (
          <button key={b} type="button" onClick={() => state.setFilter('bucket', state.filters.bucket === b ? '' : b)} aria-pressed={state.filters.bucket === b}
            className="rounded-lg border border-border bg-surface px-4 py-3 text-start shadow-xs aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary">
            <p className="text-xs font-medium text-fg-muted">{t(`bucket_${b}`)}</p>
            <p className="tabular mt-1 text-lg font-semibold text-fg">{priceOf(totals[b] ?? 0, 'EGP', locale)}</p>
          </button>
        ))}
      </div>
      <DataTable state={state} result={result} columns={columns} rowKey={(r) => `${r.bookingId}:${r.seq}`} label={t('overdue')} testId="overdue-table"
        filters={[{ key: 'status', label: t('status'), options: (['pending', 'partially_paid', 'overdue'] as const).map((s) => ({ value: s, label: ti(`installmentStatus.${s}`) })) }]}
        rowActions={(r) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => remind.mutate(r)} data-action="remind"><BellRing aria-hidden />{t('remind')}</Button>
            <Button size="sm" onClick={() => setCollect(r.bookingId)} data-action="collect"><CircleDollarSign aria-hidden />{t('collect')}</Button>
          </div>
        )}
        empty={<EmptyState icon={<CheckCircle2 aria-hidden />} title={t('noOverdue')} body={t('noOverdueBody')} />} />
      {collect && <CollectFromRow bookingId={collect} onClose={() => setCollect(null)} />}
    </div>
  );
}

type CancelRow = CancellationListItem;

/** CAN-4 approvals and CAN-5 retries. */
export function CancellationsTable() {
  const t = useTranslations('finance');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const router = useRouter();
  const date = useDateFormat();
  const base = useBookingsBase();
  const state = useListState({ pageSize: 10, sort: 'createdAt:desc' });
  const result = useQuery({ queryKey: ['cancellations', 'list', state.query], queryFn: () => api.call('cancellations.list', state.query), placeholderData: keepPreviousData });
  const [rejecting, setRejecting] = useState<CancelRow | null>(null);
  const [reason, setReason] = useState('');
  const approve = useAction((c: CancelRow) => api.call('cancellations.decide', { id: c.id, decision: 'approve' }), { success: t('cancelApproved'), invalidate: FINANCE_KEYS });
  const reject = useAction(() => api.call('cancellations.decide', { id: rejecting!.id, decision: 'reject', reason }), { success: t('cancelRejected'), invalidate: FINANCE_KEYS, onSuccess: () => { setRejecting(null); setReason(''); } });
  const retry = useAction((c: CancelRow) => api.call('cancellations.retry', { id: c.id }), { success: t('cancelRetried'), invalidate: FINANCE_KEYS });
  const columns: Column<CancelRow>[] = [
    { key: 'createdAt', header: t('date'), sortKey: 'createdAt', cell: (c) => <span className="tabular whitespace-nowrap text-sm">{date(c.createdAt)}</span> },
    { key: 'item', header: t('item'), cell: (c) => <div className="min-w-0"><p className="font-mono text-xs" dir="ltr">{c.bookingRef}</p><p className="truncate text-sm font-medium">{c.itemTitle[locale]}</p></div> },
    { key: 'reason', header: t('reason'), hideOnCard: true, cell: (c) => <div className="min-w-0"><p className="truncate text-sm">{c.reason}</p><p className="text-xs text-fg-muted">{c.requestedByName}</p></div> },
    { key: 'fee', header: t('fee'), numeric: true, cell: (c) => <span className="tabular">{priceOf(c.customerFeeMinor + c.adminFeeMinor, c.currency, locale)}</span> },
    { key: 'refund', header: t('refund'), sortKey: 'refund', numeric: true, cell: (c) => <span className="tabular font-medium">{priceOf(c.refundMinor, c.currency, locale)}</span> },
    { key: 'status', header: t('status'), cell: (c) => <Badge tone={c.status === 'completed' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'}>{t(`cancel_${c.status}`)}</Badge> },
  ];
  return (
    <>
      <DataTable state={state} result={result} columns={columns} rowKey={(c) => c.id} label={t('cancellations')} testId="cancellations-table"
        onRowClick={(c) => router.push(`${base}/${c.bookingId}`)}
        filters={[{ key: 'status', label: t('status'), options: (['requested', 'approved', 'completed', 'rejected'] as const).map((s) => ({ value: s, label: t(`cancel_${s}`) })) }, { key: 'actionable', label: t('actionable'), options: [{ value: 'true', label: t('needsMe') }] }]}
        rowActions={(c) => (
          <div className="flex justify-end gap-1">
            {c.canDecide && <Button size="sm" onClick={() => approve.mutate(c)} data-action="approve-cancel"><CheckCircle2 aria-hidden />{t('approve')}</Button>}
            {c.canDecide && <Button size="sm" variant="ghost" onClick={() => setRejecting(c)} data-action="reject-cancel"><XCircle aria-hidden />{t('reject')}</Button>}
            {c.canRetry && <Button size="sm" variant="outline" onClick={() => retry.mutate(c)} data-action="retry-cancel"><RotateCw aria-hidden />{t('retry')}</Button>}
          </div>
        )}
        empty={<EmptyState icon={<Undo2 aria-hidden />} title={t('noCancellations')} />} />
      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)} title={t('rejectCancelTitle')} description={rejecting?.itemTitle[locale]}
        footer={<><Button variant="outline" onClick={() => setRejecting(null)}>{t('cancel')}</Button><Button variant="danger" onClick={() => reject.mutate()} loading={reject.isPending} disabled={reason.trim().length < 3}>{t('reject')}</Button></>}>
        <Field label={t('reason')} required><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Dialog>
    </>
  );
}

/** Payments (W6/W7): collections and refunds, the overdue board, and cancellation approvals. */
export function PaymentsPage() {
  const t = useTranslations('finance');
  return (
    <>
      <PageHeader title={t('paymentsTitle')} description={t('paymentsDescription')} />
      <Tabs defaultValue="overdue">
        <TabsList>
          <Tab value="overdue" data-testid="tab-overdue">{t('overdue')}</Tab>
          <Tab value="collections" data-testid="tab-collections">{t('collections')}</Tab>
          <Tab value="cancellations" data-testid="tab-cancellations">{t('cancellations')}</Tab>
        </TabsList>
        <TabsPanel value="overdue"><OverdueBoard /></TabsPanel>
        <TabsPanel value="collections"><CollectionsTable /></TabsPanel>
        <TabsPanel value="cancellations"><CancellationsTable /></TabsPanel>
      </Tabs>
    </>
  );
}
