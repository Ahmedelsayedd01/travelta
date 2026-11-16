'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { InvoiceListItem } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { ArrowLeft, PencilLine, Printer, Receipt } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { Logo } from '@/components/brand/brand';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingsBase, useDateFormat } from '@/features/bookings/bookings-page';
import { priceOf } from '@/features/search/format';
import { Link, useRouter } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { FINANCE_KEYS, fromMinor, toMinor } from './collect-dialog';

export function InvoicesTable({ base }: { base: string }) {
  const t = useTranslations('finance');
  const te = useTranslations('enums');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const date = useDateFormat();
  const state = useListState({ pageSize: 10, sort: 'issuedAt:desc' });
  const result = useQuery({ queryKey: ['invoices', 'list', state.query], queryFn: () => api.call('invoices.list', state.query), placeholderData: keepPreviousData });
  const columns: Column<InvoiceListItem>[] = [
    { key: 'number', header: t('invoiceNo'), sortKey: 'number', cell: (i) => <div><p className="font-mono text-sm font-semibold" dir="ltr">{i.number}</p><p className="font-mono text-xs text-fg-muted" dir="ltr">{i.bookingRef}</p></div> },
    { key: 'billTo', header: t('billTo'), cell: (i) => <span className="text-sm">{i.billTo.name}</span> },
    { key: 'issuedAt', header: t('issued'), sortKey: 'issuedAt', cell: (i) => <span className="tabular whitespace-nowrap text-sm">{date(i.issuedAt)}</span> },
    { key: 'total', header: t('total'), sortKey: 'total', numeric: true, cell: (i) => <span className="tabular font-medium">{priceOf(i.totalMinor - i.creditedMinor, i.currency, locale)}</span> },
    { key: 'paid', header: t('paid'), numeric: true, hideOnCard: true, cell: (i) => <span className="tabular">{priceOf(i.paidMinor, i.currency, locale)}</span> },
    { key: 'status', header: t('status'), cell: (i) => <StatusBadge kind="invoiceStatus" value={i.status} /> },
  ];
  return (
    <DataTable state={state} result={result} columns={columns} rowKey={(i) => i.id} label={t('invoices')} testId="invoices-table"
      onRowClick={(i) => router.push(`${base}/${i.id}`)}
      filters={[{ key: 'status', label: t('status'), options: (['issued', 'partially_paid', 'paid', 'void'] as const).map((s) => ({ value: s, label: te(`invoiceStatus.${s}`) })) }]}
      empty={<EmptyState icon={<Receipt aria-hidden />} title={t('noInvoices')} body={t('noInvoicesBody')} />} />
  );
}

/** Printable tax invoice (INV-1..3) with credit notes and payments; staff can apply after-tax adjustments (INV-2). */
export function InvoiceView({ id, back }: { id: string; back: string }) {
  const t = useTranslations('finance');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const date = useDateFormat();
  const bookingsBase = useBookingsBase();
  const [edit, setEdit] = useState(false);
  const inv = useQuery({ queryKey: ['invoices', 'detail', id], queryFn: () => api.call('invoices.get', { id }) });
  if (inv.isError) return <ErrorState onRetry={() => void inv.refetch()} />;
  if (!inv.data) return <Skeleton className="h-[40rem] w-full" />;
  const i = inv.data;
  const money = (m: number) => priceOf(m, i.currency, locale);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={back} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><ArrowLeft className="flip-rtl size-4" aria-hidden />{t('invoices')}</Link>
        <div className="flex gap-2">
          {i.canEdit && <Button variant="outline" onClick={() => setEdit(true)} data-testid="edit-invoice"><PencilLine aria-hidden />{t('adjust')}</Button>}
          <Button onClick={() => window.print()}><Printer aria-hidden />{t('print')}</Button>
        </div>
      </div>
      <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm print:border-0 print:shadow-none" data-testid="invoice">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div><Logo /><p className="mt-2 text-sm font-semibold text-fg">{i.seller.legalName}</p><p className="text-sm text-fg-muted">{i.seller.city}, {i.seller.country}</p></div>
          <div className="text-end">
            <p className="text-xs tracking-wider text-fg-muted uppercase">{t('taxInvoice')}</p>
            <p className="font-mono text-xl font-bold text-fg" dir="ltr" data-testid="invoice-no">{i.number}</p>
            <p className="text-sm text-fg-muted">{t('issuedOn', { date: date(i.issuedAt) })}</p>
            <div className="mt-1"><StatusBadge kind="invoiceStatus" value={i.status} /></div>
          </div>
        </header>
        <div className="flex flex-col gap-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-medium tracking-wide text-fg-muted uppercase">{t('billTo')}</p><p className="font-semibold text-fg">{i.billTo.name}</p><p className="text-sm text-fg-muted" dir="ltr">{[i.billTo.email, i.billTo.phone].filter(Boolean).join(' · ')}</p></div>
            <div className="sm:text-end"><p className="text-xs font-medium tracking-wide text-fg-muted uppercase">{t('booking')}</p>
              <Link href={`${bookingsBase}/${i.bookingId}`} className="font-mono font-semibold text-primary hover:underline" dir="ltr">{i.bookingRef}</Link></div>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-start text-xs text-fg-muted uppercase"><th className="py-2 text-start font-medium">{t('description')}</th><th className="py-2 text-end font-medium">{t('tax')}</th><th className="py-2 text-end font-medium">{t('amount')}</th></tr></thead>
            <tbody className="divide-y divide-border">
              {i.lines.map((l, k) => <tr key={k}><td className="py-2 text-fg">{l.description}</td><td className="tabular py-2 text-end text-fg-muted">{money(l.taxMinor)}</td><td className="tabular py-2 text-end font-medium">{money(l.amountMinor)}</td></tr>)}
            </tbody>
          </table>
          <dl className="ms-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-fg-muted">{t('subtotal')}</dt><dd className="tabular">{money(i.subtotalMinor)}</dd></div>
            <div className="flex justify-between"><dt className="text-fg-muted">{t('tax')}</dt><dd className="tabular">{money(i.taxMinor)}</dd></div>
            {i.discountMinor > 0 && <div className="flex justify-between"><dt className="text-fg-muted">{t('discount')}</dt><dd className="tabular">−{money(i.discountMinor)}</dd></div>}
            {i.extraFeesMinor > 0 && <div className="flex justify-between"><dt className="text-fg-muted">{t('extraFees')}</dt><dd className="tabular">{money(i.extraFeesMinor)}</dd></div>}
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><dt>{t('total')}</dt><dd className="tabular" data-testid="invoice-total">{money(i.totalMinor)}</dd></div>
            {i.creditedMinor > 0 && <div className="flex justify-between"><dt className="text-fg-muted">{t('credited')}</dt><dd className="tabular">−{money(i.creditedMinor)}</dd></div>}
            <div className="flex justify-between"><dt className="text-fg-muted">{t('paid')}</dt><dd className="tabular">{money(i.paidMinor)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>{t('balanceDue')}</dt><dd className="tabular">{money(Math.max(0, i.dueMinor))}</dd></div>
          </dl>
          {i.creditNotes.length > 0 && (
            <section><h2 className="mb-2 text-sm font-semibold text-fg">{t('creditNotes')}</h2>
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">{i.creditNotes.map((c) => <li key={c.id} className="flex justify-between gap-2 px-3 py-2"><span className="font-mono" dir="ltr">{c.number}</span><span className="text-fg-muted">{t('feeKept', { fee: money(c.feeMinor) })}</span><span className="tabular font-medium">−{money(c.amountMinor)}</span></li>)}</ul>
            </section>
          )}
          {i.payments.length > 0 && (
            <section><h2 className="mb-2 text-sm font-semibold text-fg">{t('payments')}</h2>
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">{i.payments.map((p) => <li key={p.id} className="flex justify-between gap-2 px-3 py-2"><span className="font-mono text-xs" dir="ltr">{p.reference}</span><span className="text-fg-muted">{date(p.receivedAt)}</span><span className="tabular font-medium">{p.direction === 'out' ? '−' : ''}{money(p.amountMinor)}</span></li>)}</ul>
            </section>
          )}
          {i.notes && <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-fg-muted">{i.notes}</p>}
        </div>
      </article>
      {edit && <AdjustInvoiceDialog id={i.id} discount={i.discountMinor} fees={i.extraFeesMinor} notes={i.notes} currency={i.currency} onClose={() => setEdit(false)} />}
    </div>
  );
}

function AdjustInvoiceDialog({ id, discount, fees, notes, currency, onClose }: { id: string; discount: number; fees: number; notes: string; currency: string; onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const [d, setD] = useState(fromMinor(discount));
  const [f, setF] = useState(fromMinor(fees));
  const [n, setN] = useState(notes);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.call('invoices.update', { id, discountMinor: toMinor(d), extraFeesMinor: toMinor(f), notes: n }), { success: t('invoiceSaved'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('adjustTitle')} description={t('adjustBody')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} data-testid="invoice-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`${t('discount')} (${currency})`} error={errors.discountMinor}><Input type="number" min={0} step="0.01" name="discount" value={d} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label={`${t('extraFees')} (${currency})`} error={errors.extraFeesMinor}><Input type="number" min={0} step="0.01" name="fees" value={f} onChange={(e) => setF(e.target.value)} /></Field>
      </div>
      <Field label={t('notes')} optional><Textarea rows={3} name="notes" value={n} onChange={(e) => setN(e.target.value)} /></Field>
    </Dialog>
  );
}

/** /invoices and /invoices/:id (agency); the platform reaches them under accounting. */
export function InvoicesScreen({ segments }: { segments: string[] }) {
  const t = useTranslations('finance');
  const id = segments[0];
  const base = '/agency/invoices';
  if (id) return <InvoiceView id={id} back={base} />;
  return (
    <>
      <PageHeader title={t('invoicesTitle')} description={t('invoicesDescription')} />
      <InvoicesTable base={base} />
    </>
  );
}
