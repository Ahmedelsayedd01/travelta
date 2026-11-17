'use client';

import { useQuery } from '@tanstack/react-query';
import type { BookingDto, BookingItemDto } from '@travelta/schemas';
import { AlarmClock, ArrowLeft, ChevronDown, FileText, PencilLine, ServerCog, StickyNote } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Fragment, useState, type ReactNode } from 'react';
import { useApi } from '@/components/api-provider';
import { ProductThumb } from '@/components/brand/product-thumb';
import { PriceBreakdownView } from '@/components/data/price-breakdown';
import { StatusBadge } from '@/components/data/status-badge';
import { QueryErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { policyLines, priceOf } from '@/features/search/format';
import { Link } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { useCan } from '@/lib/session';
import { useBookingsBase, useDateFormat } from './bookings-page';
import { ItemActions, type ActionRenderers } from './item-actions';

const seedOf = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function useBooking(id: string) {
  const api = useApi();
  return useQuery({ queryKey: ['bookings', 'detail', id], queryFn: () => api.call('bookings.get', { id }) });
}

/** Booking detail (W5): items with actions, travellers, prices for the viewer, history, notes and API logs. */
export function BookingDetail({ id, extraActions, sections }: { id: string; extraActions?: ActionRenderers; sections?: (b: BookingDto) => ReactNode }) {
  const t = useTranslations('bookings');
  const locale = useLocale() as 'en' | 'ar';
  const date = useDateFormat();
  const base = useBookingsBase();
  const booking = useBooking(id);

  if (booking.isError) return <QueryErrorState error={booking.error} onRetry={() => void booking.refetch()} />;
  if (!booking.data) return <Skeleton className="h-96 w-full" />;
  const b = booking.data;
  const supplierView = b.audience === 'supplier';
  return (
    <div className="flex flex-col gap-6" data-testid="booking-detail">
      <div className="flex flex-col gap-3">
        <Link href={base} className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"><ArrowLeft className="flip-rtl size-4" aria-hidden />{t('backToBookings')}</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl font-bold text-fg" dir="ltr" data-testid="booking-ref">{b.ref}</h1>
            <p className="mt-1 text-sm text-fg-muted">
              {b.sellerName}{b.customerName && ` · ${b.customerName}`} · {t('createdBy', { name: b.createdByName })} · {date(b.createdAt)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge kind="bookingStatus" value={b.status} />
              {!supplierView && <StatusBadge kind="bookingPaymentStatus" value={b.paymentStatus} />}
              <Badge tone="neutral">{t(`channel`)}: {b.channel.toUpperCase()}</Badge>
              {b.overdueConfirmation && <Badge tone="danger"><AlarmClock className="size-3" aria-hidden />{t('overdue')}</Badge>}
            </div>
          </div>
          {!supplierView && (
            <Card className="min-w-56">
              <CardBody className="flex flex-col gap-1 py-3">
                <div className="flex items-baseline justify-between gap-6"><span className="text-sm text-fg-muted">{t('total')}</span><span className="tabular text-xl font-bold text-fg" data-testid="booking-total">{priceOf(b.totals.sellMinor, b.currency, locale)}</span></div>
                <div className="flex items-baseline justify-between gap-6 text-sm"><span className="text-fg-muted">{t('paid')}</span><span className="tabular">{priceOf(b.totals.paidMinor, b.currency, locale)}</span></div>
                <div className="flex items-baseline justify-between gap-6 text-sm"><span className="text-fg-muted">{t('travel')}</span><span className="tabular">{t('travelDates', { from: date(b.travelStart), to: date(b.travelEnd) })}</span></div>
              </CardBody>
            </Card>
          )}
        </div>
        {supplierView && <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info">{t('supplierView')}</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {b.items.map((item) => <ItemCard key={item.id} booking={b} item={item} base={base} extraActions={extraActions} />)}
          {sections?.(b)}
        </div>
        <div className="flex flex-col gap-4">
          <History booking={b} />
          {!supplierView && <Notes booking={b} />}
          {b.audience === 'platform' && <SupplierLogs bookingId={b.id} />}
        </div>
      </div>
    </div>
  );
}

function ItemCard({ booking: b, item, base, extraActions }: { booking: BookingDto; item: BookingItemDto; base: string; extraActions?: ActionRenderers }) {
  const t = useTranslations('bookings');
  const ts = useTranslations('search');
  const tc = useTranslations('catalog');
  const te = useTranslations('enums');
  const tk = useTranslations('checkout');
  const locale = useLocale() as 'en' | 'ar';
  const date = useDateFormat();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const canEdit = useCan('bookings.update_details') && !['cancelled', 'rejected', 'travelled', 'no_show'].includes(item.status);
  const details = Object.entries(item.details).filter(([k, v]) => k !== 'documents' && typeof v === 'string' && v);
  const supplierView = b.audience === 'supplier';
  return (
    <Card data-testid="booking-item" data-item={item.id} data-status={item.status} data-service={item.serviceType}>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <ProductThumb serviceType={item.serviceType} seed={seedOf(item.productId ?? item.id)} className="h-24 w-full shrink-0 sm:w-32" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-fg-muted">{t('item', { n: item.seq })} · {te(`serviceType.${item.serviceType}`)}</span>
              <StatusBadge kind="bookingItemStatus" value={item.status} />
              {item.status === 'pending' && item.holdReason && <Badge tone="warning">{te(`holdReason.${item.holdReason}`)}</Badge>}
            </div>
            <h2 className="text-lg font-semibold text-fg">{item.title[locale]}</h2>
            <p className="text-sm text-fg-muted">{item.subtitle[locale]}</p>
            <p className="text-sm text-fg-muted">{item.to ? t('travelDates', { from: date(item.from), to: date(item.to) }) : date(item.from)}{item.mealPlan && ` · ${ts(`meal_${item.mealPlan}`)}`}</p>
            <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <div className="flex gap-1.5"><dt className="text-fg-muted">{t('supplier')}:</dt><dd className="font-medium text-fg">{item.supplierName}</dd></div>
              {item.supplierRef && <div className="flex gap-1.5"><dt className="text-fg-muted">{t('supplierRef')}:</dt><dd className="font-mono font-medium text-fg" dir="ltr">{item.supplierRef}</dd></div>}
              {item.voucherNo && <div className="flex gap-1.5"><dt className="text-fg-muted">{t('voucherNo')}:</dt><dd className="font-mono font-medium text-fg" dir="ltr">{item.voucherNo}</dd></div>}
            </dl>
            {item.rejectReason && <p className="text-sm text-danger">{item.rejectReason}</p>}
          </div>
          <div className="flex flex-row items-end justify-between gap-2 sm:flex-col sm:text-end">
            <div>
              <p className="tabular text-lg font-bold text-fg">{priceOf(item.priceMinor, b.currency, locale)}</p>
              {supplierView ? <p className="text-xs text-fg-muted">{t('payout')}</p>
                : item.costMinor !== null && <p className="tabular text-xs text-fg-muted">{t('yourCost')}: {priceOf(item.costMinor, b.currency, locale)}</p>}
            </div>
            {['vouchered', 'travelled', 'no_show'].includes(item.status) && item.voucherNo && !supplierView && (
              <Link href={`${base}/${b.id}/voucher/${item.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline" data-testid="voucher-link"><FileText className="size-4" aria-hidden />{t('viewVoucher')}</Link>
            )}
          </div>
        </div>

        <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">{t('travellers')}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {item.travellers.map((tr, k) => (
                <li key={k} className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-fg">{tk(`title_${tr.title}`)} {tr.firstName} {tr.lastName}</span>
                  <span className="text-xs text-fg-muted">{te(`paxType.${tr.type}`)}</span>
                  {tr.lead && <Badge tone="primary">{tk('leadTraveller')}</Badge>}
                  {tr.passportNo && <span className="font-mono text-xs text-fg-muted" dir="ltr">{tr.passportNo}</span>}
                  {tr.mahram && <span className="text-xs text-fg-muted">· {tk('mahram')}: {tr.mahram}</span>}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-fg">
              {t('details')}
              {canEdit && <button type="button" onClick={() => setEdit(true)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" data-testid="edit-details"><PencilLine className="size-3.5" aria-hidden />{t('edit')}</button>}
            </h3>
            {details.length === 0 && !item.details.documents?.length ? <p className="text-sm text-fg-muted">—</p> : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {details.map(([k, v]) => (
                  <Fragment key={k}><dt className="text-fg-muted">{t.has(k as never) ? t(k as never) : tk.has(k as never) ? tk(k as never) : k}</dt><dd className="text-fg">{String(v)}</dd></Fragment>
                ))}
                {item.details.documents?.length ? (<><dt className="text-fg-muted">{tk('documents')}</dt><dd className="text-fg">{item.details.documents.map((d) => d.name).join(', ')}</dd></>) : null}
              </dl>
            )}
            <p className="mt-2 text-xs text-fg-muted">{tc('policy')}: {policyLines(item.policy, ts as never, tc as never)[0]}</p>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <ItemActions size="md" target={{ bookingId: b.id, itemId: item.id, title: item.title[locale], serviceType: item.serviceType }} actions={item.actions} extra={extraActions} />
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="ms-auto flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {t('priceDetails')}<ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </div>
        {open && <PriceBreakdownView breakdown={item.breakdown} showSettlement={b.audience !== 'customer' && !supplierView} />}
      </CardBody>
      {edit && <EditDetails booking={b} item={item} onClose={() => setEdit(false)} />}
    </Card>
  );
}

function EditDetails({ booking, item, onClose }: { booking: BookingDto; item: BookingItemDto; onClose: () => void }) {
  const t = useTranslations('bookings');
  const api = useApi();
  const s = item.serviceType;
  const fields = (['specialRequests', ...(s === 'flight' ? ['pnr', 'ticketNo'] : []), ...(s === 'transfer' ? ['driver', 'pickupPoint', 'time'] : []), ...(s === 'activity' || s === 'tour' ? ['pickupPoint'] : []), ...(s === 'visa' ? ['appointmentDate'] : [])]) as ('specialRequests' | 'pnr' | 'ticketNo' | 'driver' | 'pickupPoint' | 'time' | 'appointmentDate')[];
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f, String(item.details[f] ?? '')])));
  const save = useAction(() => api.call('bookings.updateItemDetails', {
    bookingId: booking.id, itemId: item.id, details: Object.fromEntries(Object.entries(v).filter(([, x]) => x.trim()).map(([k, x]) => [k, x.trim()])),
  }), { success: t('detailsSaved'), invalidate: [['bookings']], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('edit')} footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate()} loading={save.isPending} data-testid="save-details">{t('edit')}</Button></>}>
      <div className="grid gap-3">
        {fields.map((f) => (
          <Field key={f} label={t(f)} optional>
            <Input name={f} type={f === 'appointmentDate' ? 'date' : 'text'} value={v[f] ?? ''} onChange={(e) => setV({ ...v, [f]: e.target.value })} dir={f === 'specialRequests' || f === 'pickupPoint' || f === 'driver' ? undefined : 'ltr'} />
          </Field>
        ))}
      </div>
    </Dialog>
  );
}

function History({ booking }: { booking: BookingDto }) {
  const t = useTranslations('bookings');
  const te = useTranslations('enums');
  const format = useFormatter();
  const label = (s: string) => (te.has(`bookingItemStatus.${s}` as never) ? te(`bookingItemStatus.${s}` as never) : te.has(`bookingStatus.${s}` as never) ? te(`bookingStatus.${s}` as never) : s);
  return (
    <Card>
      <CardHeader title={t('history')} />
      <CardBody>
        <ol className="relative flex flex-col gap-4 border-s border-border ps-4" data-testid="booking-history">
          {booking.events.map((e) => {
            const item = booking.items.find((i) => i.id === e.itemId);
            return (
              <li key={e.id} className="relative">
                <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-surface-raised" aria-hidden />
                <p className="text-sm text-fg">{item ? `${t('item', { n: item.seq })}: ` : ''}{e.from ? `${label(e.from)} → ` : ''}<span className="font-semibold">{label(e.to)}</span></p>
                {e.reason && <p className="text-xs text-fg-muted">{e.reason}</p>}
                <p className="text-xs text-fg-muted">{format.dateTime(new Date(e.at), { dateStyle: 'medium', timeStyle: 'short' })} · {t('byActor', { name: e.actorName })}</p>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

function Notes({ booking }: { booking: BookingDto }) {
  const t = useTranslations('bookings');
  const format = useFormatter();
  const api = useApi();
  const [text, setText] = useState('');
  const add = useAction(() => api.call('bookings.addNote', { bookingId: booking.id, text }), { success: t('noteAdded'), invalidate: [['bookings']], onSuccess: () => setText('') });
  return (
    <Card>
      <CardHeader title={t('notes')} />
      <CardBody className="flex flex-col gap-3">
        {booking.notes.length === 0 ? <p className="text-sm text-fg-muted">{t('noNotes')}</p> : (
          <ul className="flex flex-col gap-2">
            {booking.notes.map((n) => (
              <li key={n.id} className="rounded-md bg-subtle px-3 py-2">
                <p className="flex items-start gap-1.5 text-sm text-fg"><StickyNote className="mt-0.5 size-3.5 shrink-0 text-fg-muted" aria-hidden />{n.text}</p>
                <p className="mt-0.5 text-xs text-fg-muted">{n.userName} · {format.dateTime(new Date(n.at), { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </li>
            ))}
          </ul>
        )}
        <Textarea rows={2} name="note" placeholder={t('notePlaceholder')} aria-label={t('addNote')} value={text} onChange={(e) => setText(e.target.value)} />
        <Button size="sm" variant="outline" className="self-end" disabled={!text.trim()} loading={add.isPending} onClick={() => add.mutate()} data-testid="add-note">{t('addNote')}</Button>
      </CardBody>
    </Card>
  );
}

function SupplierLogs({ bookingId }: { bookingId: string }) {
  const t = useTranslations('bookings');
  const format = useFormatter();
  const api = useApi();
  const logs = useQuery({ queryKey: ['bookings', 'logs', bookingId], queryFn: () => api.call('bookings.supplierLogs', { bookingId }) });
  if (!logs.data || logs.data.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t('supplierLogs')} />
      <CardBody className="flex flex-col gap-2">
        {logs.data.map((l) => (
          <details key={l.id} className="rounded-md border border-border px-3 py-2 text-sm">
            <summary className="flex cursor-pointer items-center gap-2">
              <ServerCog className="size-4 text-fg-muted" aria-hidden />
              <span className="font-medium">{l.provider.toUpperCase()} · {l.operation}</span>
              <Badge tone={l.outcome === 'confirmed' ? 'success' : l.outcome === 'pending' ? 'warning' : 'danger'}>{l.outcome}</Badge>
              <span className="ms-auto text-xs text-fg-muted">{t('latency', { ms: l.latencyMs })} · {format.dateTime(new Date(l.at), { timeStyle: 'short' })}</span>
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-subtle p-2 text-xs" dir="ltr" tabIndex={0}>{l.request}{'\n'}{l.response}</pre>
          </details>
        ))}
      </CardBody>
    </Card>
  );
}
