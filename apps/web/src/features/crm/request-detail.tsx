'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES, type ServiceType } from '@travelta/contracts';
import type { ManualItemInput, QuotationEntity, RequestDetail } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { ArrowLeft, CheckCircle2, FileText, Mail, MessageCircle, PencilLine, Plus, ShoppingCart, Trash2, Trophy, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { StatusBadge } from '@/components/data/status-badge';
import { ErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDateFormat } from '@/features/bookings/bookings-page';
import { useDemoToday } from '@/features/demo/hooks';
import { priceOf } from '@/features/search/format';
import { Link, useRouter } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { addDays } from '@travelta/shared';
import { useMoveRequest } from './crm-page';
import { CRM_KEYS, RequestDialog, Timeline, useDateTime } from './shared';

interface LineDraft { serviceType: ServiceType; supplier: string; title: string; from: string; to: string; adults: string; children: string; cost: string; markup: string }
const RANGE: ServiceType[] = ['hotel', 'tour', 'umrah'];

function toItem(d: LineDraft): ManualItemInput | null {
  const net = Math.round(Number(d.cost) * 100);
  if (!d.supplier || d.title.trim().length < 2 || !(net > 0)) return null;
  const [kind, id] = d.supplier.split(':') as ['own' | 'network', string];
  return {
    serviceType: d.serviceType, supplier: { kind, id }, title: d.title.trim(), destinationId: null, from: d.from, to: RANGE.includes(d.serviceType) ? d.to || null : null,
    occupancy: { adults: Math.max(1, Number(d.adults || 1)), children: Number(d.children || 0), infants: 0, rooms: [] }, netMinor: net, netCurrency: 'EGP',
    markup: { mode: 'percent', value: Number(d.markup || 0) }, taxProfileId: null, policy: { nonRefundable: false, rules: [{ daysBefore: 7, feeType: 'percent', value: 50 }] }, details: {},
  };
}

function fromLine(item: ManualItemInput): LineDraft {
  return {
    serviceType: item.serviceType, supplier: `${item.supplier.kind}:${item.supplier.id}`, title: item.title, from: item.from, to: item.to ?? '',
    adults: String(item.occupancy.adults), children: String(item.occupancy.children), cost: String(item.netMinor / 100), markup: String(item.markup.mode === 'percent' ? item.markup.value : 0),
  };
}

/** Quotation editor: lines priced live by the engine (cart.previewManual) — exactly what the booking will cost. */
function QuotationDialog({ detail, base, onClose }: { detail: RequestDetail; base: QuotationEntity | null; onClose: () => void }) {
  const t = useTranslations('crm');
  const te = useTranslations('enums');
  const locale = useLocale();
  const api = useApi();
  const today = useDemoToday();
  const r = detail.request;
  const suppliers = useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => api.call('suppliers.list', { page: 1, pageSize: 100 }) });
  const blank = (): LineDraft => ({ serviceType: r.serviceType, supplier: '', title: r.title, from: r.from, to: r.to ?? '', adults: String(r.adults), children: String(r.children), cost: '', markup: '15' });
  const [lines, setLines] = useState<LineDraft[]>(base ? base.lines.map((l) => fromLine(l.item as ManualItemInput)) : [blank()]);
  const [validUntil, setValidUntil] = useState(addDays(today, 7));
  const [notes, setNotes] = useState(base?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const items = lines.map(toItem);
  const previews = useQueries({ queries: items.map((it, i) => ({ queryKey: ['crm', 'preview', i, it], queryFn: () => api.call('cart.previewManual', it!), enabled: it !== null, retry: false })) });
  const total = previews.reduce((s, p) => s + (p.data?.breakdown.totals.customerTotalMinor ?? 0), 0);
  const set = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const save = useAction(() => api.call('crm.quotations.save', { requestId: r.id, lines: items.filter((x): x is ManualItemInput => x !== null), validUntil, notes }), { success: t('quotationSaved'), invalidate: CRM_KEYS, onSuccess: onClose });
  const options = (s: ServiceType) => (suppliers.data?.items ?? []).filter((x) => x.serviceTypes.includes(s) && x.status === 'active');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={base ? t('reviseQuotation') : t('newQuotation')} description={t('quotationBody')} size="lg"
      footer={<><span className="me-auto self-center text-sm">{t('quoteTotal')}: <strong className="tabular" data-testid="quote-total">{priceOf(total, 'EGP', locale)}</strong></span><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} disabled={items.some((x) => x === null)} data-testid="quotation-save">{t('saveQuotation')}</Button></>}>
      <div className="flex flex-col gap-4" data-testid="quotation-form">
        {lines.map((l, i) => (
          <fieldset key={i} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-4" data-line={i}>
            <legend className="px-1 text-xs font-semibold text-fg-muted">{t('line', { n: i + 1 })}</legend>
            <Field label={t('service')}><Select name={`svc${i}`} value={l.serviceType} onChange={(e) => set(i, { serviceType: e.target.value as ServiceType, supplier: '' })}>{SERVICE_TYPES.map((s) => <option key={s} value={s}>{te(`serviceType.${s}`)}</option>)}</Select></Field>
            <Field label={t('supplier')} className="sm:col-span-3" error={errors[`lines.${i}.supplier`]}>
              <Select name={`sup${i}`} value={l.supplier} onChange={(e) => set(i, { supplier: e.target.value })}>
                <option value="">{t('choose')}</option>
                {options(l.serviceType).map((s) => <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{s.name[locale as 'en' | 'ar']} · {t(`supplierKind_${s.kind}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('title')} className="sm:col-span-4"><Input name={`title${i}`} value={l.title} onChange={(e) => set(i, { title: e.target.value })} /></Field>
            <Field label={t('from')}><DateInput name={`from${i}`} value={l.from} onChange={(e) => set(i, { from: e.target.value })} /></Field>
            {RANGE.includes(l.serviceType) ? <Field label={t('to')}><DateInput name={`to${i}`} value={l.to} onChange={(e) => set(i, { to: e.target.value })} /></Field> : <span className="hidden sm:block" />}
            <Field label={t('adults')}><Input type="number" min={1} name={`ad${i}`} value={l.adults} onChange={(e) => set(i, { adults: e.target.value })} /></Field>
            <Field label={t('children')}><Input type="number" min={0} name={`ch${i}`} value={l.children} onChange={(e) => set(i, { children: e.target.value })} /></Field>
            <Field label={t('cost')} className="sm:col-span-2"><Input type="number" min={0} step="0.01" name={`cost${i}`} value={l.cost} onChange={(e) => set(i, { cost: e.target.value })} /></Field>
            <Field label={t('markupPct')}><Input type="number" min={0} step="0.5" name={`mk${i}`} value={l.markup} onChange={(e) => set(i, { markup: e.target.value })} /></Field>
            <div className="flex items-end justify-between gap-2">
              <p className="tabular text-sm" data-testid={`line-price-${i}`}>{previews[i]?.data ? priceOf(previews[i]!.data!.breakdown.totals.customerTotalMinor, 'EGP', locale) : previews[i]?.isError ? <span className="text-danger">{t('cannotPrice')}</span> : '—'}</p>
              <Button size="icon" variant="ghost" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))} aria-label={t('removeLine')}><Trash2 aria-hidden /></Button>
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="outline" size="sm" disabled={lines.length >= 10} onClick={() => setLines([...lines, blank()])} data-testid="add-quote-line"><Plus aria-hidden />{t('addLine')}</Button>
          <Field label={t('validUntil')} className="ms-auto" error={errors.validUntil}><DateInput name="validUntil" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
        </div>
        <Field label={t('notes')} optional><Input name="quoteNotes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

function QuotationCard({ q, detail, onRevise }: { q: QuotationEntity; detail: RequestDetail; onRevise: () => void }) {
  const t = useTranslations('crm');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const date = useDateFormat();
  const dt = useDateTime();
  const r = detail.request;
  const open = r.stage !== 'won' && r.stage !== 'lost' && r.canEdit;
  const live = q.status !== 'superseded' && q.status !== 'rejected';
  const send = useAction((via: 'email' | 'whatsapp') => api.call('crm.quotations.send', { id: q.id, via }), { success: t('quotationSent'), invalidate: CRM_KEYS });
  const decide = useAction((decision: 'accepted' | 'rejected') => api.call('crm.quotations.decide', { id: q.id, decision }), { success: t('quotationUpdated'), invalidate: CRM_KEYS });
  const win = useAction(() => api.call('crm.requests.win', { id: r.id, quotationId: q.id }), {
    success: t('wonToast'), invalidate: CRM_KEYS, onSuccess: (out) => router.push(`/agency/checkout?customer=${out.customerId}&request=${out.requestId}`),
  });
  const margin = q.totalMinor - q.costMinor;
  return (
    <Card data-testid="quotation" data-status={q.status} className={!live ? 'opacity-70' : undefined}>
      <CardHeader title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono" dir="ltr">{q.number}</span><Badge tone="neutral">v{q.revision}</Badge><Badge tone={q.status === 'accepted' ? 'success' : q.status === 'sent' ? 'info' : q.status === 'rejected' ? 'danger' : 'neutral'}>{t(`qt_${q.status}`)}</Badge></span>}
        description={`${t('validUntilDate', { date: date(q.validUntil) })}${q.sentAt ? ` · ${t('sentVia', { via: t(`via_${q.sentVia ?? 'email'}`), at: dt(q.sentAt) })}` : ''}`} />
      <CardBody className="flex flex-col gap-3">
        <ul className="divide-y divide-border text-sm">
          {q.lines.map((l, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span className="min-w-0"><span className="block truncate font-medium">{l.title[locale as 'en' | 'ar']}</span><span className="text-xs text-fg-muted">{l.supplierName}</span></span><span className="tabular">{priceOf(l.sellMinor, q.currency, locale)}</span></li>)}
        </ul>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-2 text-sm">
          <span className="text-fg-muted">{t('margin', { amount: priceOf(margin, q.currency, locale) })}</span>
          <span className="tabular text-base font-bold">{priceOf(q.totalMinor, q.currency, locale)}</span>
        </div>
        {open && live && (
          <div className="flex flex-wrap gap-2">
            {(q.status === 'draft' || q.status === 'sent') && <Button size="sm" variant="outline" onClick={() => send.mutate('email')} loading={send.isPending} data-action="send-email"><Mail aria-hidden />{t('sendEmail')}</Button>}
            {(q.status === 'draft' || q.status === 'sent') && <Button size="sm" variant="outline" onClick={() => send.mutate('whatsapp')} loading={send.isPending} data-action="send-whatsapp"><MessageCircle aria-hidden />{t('sendWhatsapp')}</Button>}
            {q.status === 'sent' && <Button size="sm" variant="ghost" onClick={() => decide.mutate('accepted')} data-action="accept"><CheckCircle2 aria-hidden />{t('customerAccepted')}</Button>}
            {q.status === 'sent' && <Button size="sm" variant="ghost" onClick={() => decide.mutate('rejected')}><XCircle aria-hidden />{t('customerRejected')}</Button>}
            <Button size="sm" variant="ghost" onClick={onRevise}><PencilLine aria-hidden />{t('revise')}</Button>
            {r.moves.includes('won') && <Button size="sm" onClick={() => win.mutate()} loading={win.isPending} data-action="win"><Trophy aria-hidden />{t('winAndBook')}</Button>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Request detail (W4): pipeline controls, engine-priced quotations, win → pre-filled checkout, follow-ups and activity. */
export function RequestDetailView({ id }: { id: string }) {
  const t = useTranslations('crm');
  const te = useTranslations('enums');
  const locale = useLocale();
  const api = useApi();
  const date = useDateFormat();
  const dt = useDateTime();
  const mover = useMoveRequest();
  const [quote, setQuote] = useState<QuotationEntity | 'new' | null>(null);
  const [edit, setEdit] = useState(false);
  const q = useQuery({ queryKey: ['crm', 'request', id], queryFn: () => api.call('crm.requests.get', { id }) });
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96 w-full" />;
  const d = q.data;
  const r = d.request;
  const closed = r.stage === 'won' || r.stage === 'lost';
  return (
    <div className="flex flex-col gap-6" data-testid="request-detail" data-stage={r.stage}>
      <div className="flex flex-col gap-3">
        <Link href="/agency/crm" className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"><ArrowLeft className="flip-rtl size-4" aria-hidden />{t('backToPipeline')}</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm text-fg-muted" dir="ltr">{r.ref}</p>
            <h1 className="text-2xl font-bold text-fg">{r.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge kind="requestStage" value={r.stage} />
              <Badge tone={r.priority === 'high' ? 'danger' : r.priority === 'medium' ? 'warning' : 'neutral'}>{te(`priority.${r.priority}`)}</Badge>
              <Badge tone="neutral">{te(`serviceType.${r.serviceType}`)}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {r.canEdit && <Button variant="outline" onClick={() => setEdit(true)}><PencilLine aria-hidden />{t('edit')}</Button>}
            {r.moves.filter((m) => m !== 'won').map((m) => (
              <Button key={m} variant={m === 'lost' ? 'ghost' : 'outline'} onClick={() => mover.request(r, m)} data-move={m}>{t('moveToStage', { stage: te(`requestStage.${m}`) })}</Button>
            ))}
            {!closed && r.canEdit && <Button onClick={() => setQuote('new')} data-testid="new-quotation"><FileText aria-hidden />{t('newQuotation')}</Button>}
          </div>
        </div>
        {r.stage === 'lost' && r.lostReason && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{t('lostBecause', { reason: r.lostReason })}</p>}
        {r.stage === 'won' && !d.booking && (
          <p className="flex flex-wrap items-center gap-2 rounded-md bg-success-bg px-3 py-2 text-sm text-success">{t('wonNoBooking')}
            <Link href={`/agency/checkout?customer=${r.customerId}&request=${r.id}`} className="inline-flex items-center gap-1 font-semibold underline"><ShoppingCart className="size-4" aria-hidden />{t('goCheckout')}</Link></p>
        )}
        {d.booking && <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">{t('bookedAs')} <Link href={`/agency/bookings/${d.booking.id}`} className="font-mono font-semibold underline" dir="ltr" data-testid="request-booking">{d.booking.ref}</Link></p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardBody className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-fg-muted">{d.customer ? t('customer') : t('lead')}</p>
                {d.customer ? <Link href={`/agency/customers/${d.customer.id}`} className="font-medium text-primary hover:underline">{d.customer.name}</Link> : <p className="font-medium">{d.lead?.name}</p>}
                <p className="text-xs text-fg-muted" dir="ltr">{d.customer?.phone || d.lead?.phone || d.customer?.email || d.lead?.email}</p></div>
              <div><p className="text-xs text-fg-muted">{t('travel')}</p><p className="font-medium">{date(r.from)}{r.to && ` → ${date(r.to)}`}</p><p className="text-xs text-fg-muted">{r.destination}</p></div>
              <div><p className="text-xs text-fg-muted">{t('pax')}</p><p className="font-medium">{t('paxLine', { adults: r.adults, children: r.children })}</p></div>
              <div><p className="text-xs text-fg-muted">{t('expectedRevenue')}</p><p className="tabular font-medium">{priceOf(r.expectedRevenueMinor, r.currency, locale)}</p></div>
              <div><p className="text-xs text-fg-muted">{t('assignee')}</p><p className="font-medium">{r.assigneeName}</p></div>
              <div><p className="text-xs text-fg-muted">{t('inStageSince')}</p><p className="font-medium">{dt(r.stageChangedAt)}</p></div>
              {r.notes && <p className="text-fg-muted sm:col-span-3">{r.notes}</p>}
            </CardBody>
          </Card>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-fg">{t('quotations')}</h2>
            {d.quotations.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">{t('noQuotations')}</p>
              : d.quotations.map((x) => <QuotationCard key={x.id} q={x} detail={d} onRevise={() => setQuote(x)} />)}
          </section>
          {d.followUps.length > 0 && (
            <Card>
              <CardHeader title={t('followUps')} />
              <CardBody>
                <ul className="divide-y divide-border text-sm">
                  {d.followUps.map((f) => <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{t(`fu_${f.type}`)} · {f.note || '—'} <span className="text-fg-muted">· {f.assigneeName}</span></span><span className="flex items-center gap-1.5">{dt(f.dueAt)}{f.overdue && <Badge tone="danger">{t('overdue')}</Badge>}{f.doneAt && <Badge tone="success">{t('done')}</Badge>}</span></li>)}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
        <Timeline entity={{ kind: 'request', id: r.id }} activities={d.activities} canNote={r.canEdit || r.moves.length > 0} />
      </div>
      {quote && <QuotationDialog detail={d} base={quote === 'new' ? null : quote} onClose={() => setQuote(null)} />}
      {edit && <RequestDialog request={r} onClose={() => setEdit(false)} />}
      {mover.dialog}
    </div>
  );
}
