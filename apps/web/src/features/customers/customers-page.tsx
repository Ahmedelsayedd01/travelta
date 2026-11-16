'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CustomerEntity } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { ArrowLeft, Building2, ClipboardList, Coins, PencilLine, Ticket, User, UserPlus, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useDateFormat } from '@/features/bookings/bookings-page';
import { RequestDialog, SOURCES, Timeline, useDateTime } from '@/features/crm/shared';
import { priceOf } from '@/features/search/format';
import { Link, useRouter } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { useCan } from '@/lib/session';

type Row = CustomerEntity & { bookingsCount: number; totalSpentMinor: number };

function CustomerDialog({ customer, onClose }: { customer: CustomerEntity | null; onClose: () => void }) {
  const t = useTranslations('crm');
  const te = useTranslations('enums');
  const api = useApi();
  const router = useRouter();
  const [v, setV] = useState({
    kind: customer?.kind ?? 'individual', name: customer?.name ?? '', email: customer?.email ?? '', phone: customer?.phone ?? '', nationalityIso2: customer?.nationalityIso2 ?? 'EG',
    customerType: customer?.customerType ?? 'individual', source: customer?.source ?? 'walk_in', tags: (customer?.tags ?? []).join(', '), notes: customer?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.call('customers.save', {
    id: customer?.id, kind: v.kind, name: v.name, email: v.email, phone: v.phone, nationalityIso2: v.nationalityIso2 || null, customerType: v.customerType, source: v.source,
    tags: v.tags.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10), notes: v.notes,
  }), { success: t('customerSaved'), invalidate: [['customers'], ['crm']], onSuccess: (c) => { onClose(); if (!customer) router.push(`/agency/customers/${c.id}`); } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={customer ? t('editCustomer') : t('newCustomer')} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} data-testid="customer-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="customer-form">
        <Field label={t('kind')}><Select name="kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as typeof v.kind })}><option value="individual">{t('individual')}</option><option value="corporate">{t('corporate')}</option></Select></Field>
        <Field label={t('segment')}><Select name="customerType" value={v.customerType} onChange={(e) => setV({ ...v, customerType: e.target.value as typeof v.customerType })}>{(['individual', 'corporate', 'vip'] as const).map((c) => <option key={c} value={c}>{te(`customerType.${c}`)}</option>)}</Select></Field>
        <Field label={t('name')} required error={errors.name} className="sm:col-span-2"><Input name="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label={t('email')} error={errors.email}><Input name="email" type="email" dir="ltr" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label={t('phone')} error={errors.phone}><Input name="phone" dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label={t('nationality')}><Input name="nationality" dir="ltr" maxLength={2} value={v.nationalityIso2} onChange={(e) => setV({ ...v, nationalityIso2: e.target.value.toUpperCase() })} /></Field>
        <Field label={t('source')}><Select name="source" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value as typeof v.source })}>{SOURCES.map((s) => <option key={s} value={s}>{t(`source_${s}`)}</option>)}</Select></Field>
        <Field label={t('tags')} optional help={t('tagsHelp')} className="sm:col-span-2"><Input name="tags" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} /></Field>
        <Field label={t('notes')} optional className="sm:col-span-2"><Textarea name="notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

function CustomersList() {
  const t = useTranslations('crm');
  const te = useTranslations('enums');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const canManage = useCan('customers.manage');
  const state = useListState({ pageSize: 10, sort: 'name:asc' });
  const result = useQuery({ queryKey: ['customers', 'list', state.query], queryFn: () => api.call('customers.list', state.query), placeholderData: keepPreviousData });
  const [creating, setCreating] = useState(false);
  const columns: Column<Row>[] = [
    { key: 'name', header: t('name'), sortKey: 'name', cell: (c) => <div className="flex items-center gap-2">{c.kind === 'corporate' ? <Building2 className="size-4 text-fg-muted" aria-hidden /> : <User className="size-4 text-fg-muted" aria-hidden />}<div><p className="font-medium">{c.name}</p><p className="text-xs text-fg-muted" dir="ltr">{c.email || c.phone}</p></div></div> },
    { key: 'segment', header: t('segment'), cell: (c) => <div className="flex flex-wrap gap-1"><Badge tone={c.customerType === 'vip' ? 'warning' : 'neutral'}>{te(`customerType.${c.customerType}`)}</Badge>{c.tags.slice(0, 2).map((x) => <Badge key={x} tone="info">{x}</Badge>)}</div> },
    { key: 'source', header: t('source'), hideOnCard: true, cell: (c) => <span className="text-sm">{t(`source_${c.source}`)}</span> },
    { key: 'bookings', header: t('bookings'), numeric: true, cell: (c) => <span className="tabular">{c.bookingsCount}</span> },
    { key: 'spent', header: t('totalSpent'), sortKey: 'totalSpent', numeric: true, cell: (c) => <span className="tabular font-medium">{priceOf(c.totalSpentMinor, 'EGP', locale)}</span> },
  ];
  return (
    <>
      <PageHeader title={t('customersTitle')} description={t('customersDescription')} actions={canManage && <Button onClick={() => setCreating(true)} data-testid="new-customer"><UserPlus aria-hidden />{t('newCustomer')}</Button>} />
      <DataTable state={state} result={result} columns={columns} rowKey={(c) => c.id} label={t('customersTitle')} testId="customers-table" onRowClick={(c) => router.push(`/agency/customers/${c.id}`)}
        filters={[
          { key: 'customerType', label: t('segment'), options: (['individual', 'corporate', 'vip'] as const).map((c) => ({ value: c, label: te(`customerType.${c}`) })) },
          { key: 'kind', label: t('kind'), options: [{ value: 'individual', label: t('individual') }, { value: 'corporate', label: t('corporate') }] },
        ]}
        empty={<EmptyState icon={<User aria-hidden />} title={t('noCustomers')} />} />
      {creating && <CustomerDialog customer={null} onClose={() => setCreating(false)} />}
    </>
  );
}

/** Customer 360 (W4): profile, totals, requests, bookings, payments, follow-ups and the activity timeline. */
function Customer360({ id }: { id: string }) {
  const t = useTranslations('crm');
  const te = useTranslations('enums');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const date = useDateFormat();
  const dt = useDateTime();
  const canManage = useCan('customers.manage');
  const manageOwn = useCan('crm.manage_own');
  const manageAll = useCan('crm.manage_all');
  const crm = manageOwn || manageAll;
  const [edit, setEdit] = useState(false);
  const [request, setRequest] = useState(false);
  const q = useQuery({ queryKey: ['customers', '360', id], queryFn: () => api.call('customers.get360', { id }) });
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96 w-full" />;
  const d = q.data;
  const c = d.customer;
  const money = (m: number) => priceOf(m, d.totals.currency, locale);
  return (
    <div className="flex flex-col gap-6" data-testid="customer-360">
      <div className="flex flex-col gap-3">
        <Link href="/agency/customers" className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"><ArrowLeft className="flip-rtl size-4" aria-hidden />{t('allCustomers')}</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-fg">{c.name}</h1>
            <p className="text-sm text-fg-muted" dir="ltr">{[c.email, c.phone].filter(Boolean).join(' · ')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={c.customerType === 'vip' ? 'warning' : 'neutral'}>{te(`customerType.${c.customerType}`)}</Badge><Badge tone="neutral">{t(`source_${c.source}`)}</Badge>{c.tags.map((x) => <Badge key={x} tone="info">{x}</Badge>)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && <Button variant="outline" onClick={() => setEdit(true)}><PencilLine aria-hidden />{t('edit')}</Button>}
            {crm && <Button onClick={() => setRequest(true)} data-testid="customer-new-request"><ClipboardList aria-hidden />{t('newRequest')}</Button>}
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('booked')} value={money(d.totals.bookedMinor)} icon={<Ticket />} deltaLabel={t('bookingsCount', { n: d.totals.bookings })} />
        <StatCard label={t('paidTotal')} value={money(d.totals.paidMinor)} icon={<Coins />} />
        <StatCard label={t('outstanding')} value={<span className={d.totals.outstandingMinor > 0 ? 'text-warning' : undefined} data-testid="c360-outstanding">{money(d.totals.outstandingMinor)}</span>} icon={<Wallet />} />
        <StatCard label={t('openRequests')} value={d.totals.openRequests} icon={<ClipboardList />} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title={t('bookings')} />
            <CardBody className="p-0">
              {d.bookings.length === 0 ? <p className="px-5 py-4 text-sm text-fg-muted">{t('noBookingsYet')}</p> : (
                <ul className="divide-y divide-border" data-testid="c360-bookings">
                  {d.bookings.map((b) => (
                    <li key={b.id}><Link href={`/agency/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-subtle">
                      <span className="min-w-0"><span className="block font-mono text-xs text-fg-muted" dir="ltr">{b.ref}</span><span className="block truncate font-medium">{b.title[locale]}</span></span>
                      <span className="flex items-center gap-2"><span className="text-xs text-fg-muted">{date(b.travelStart)}</span><StatusBadge kind="bookingStatus" value={b.status} /><span className="tabular font-medium">{priceOf(b.totalMinor, b.currency, locale)}</span></span>
                    </Link></li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          {d.requests.length > 0 && (
            <Card>
              <CardHeader title={t('requests')} />
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {d.requests.map((r) => (
                    <li key={r.id}><Link href={`/agency/crm/requests/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-subtle">
                      <span><span className="font-mono text-xs text-fg-muted" dir="ltr">{r.ref}</span> · <span className="font-medium">{r.title}</span></span><StatusBadge kind="requestStage" value={r.stage} />
                    </Link></li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {d.payments.length > 0 && (
            <Card>
              <CardHeader title={t('payments')} />
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {d.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-sm">
                      <span><span className="font-mono text-xs" dir="ltr">{p.reference}</span> <span className="text-fg-muted">· {p.bookingRef} · {dt(p.receivedAt)}</span></span>
                      <span className={p.direction === 'out' ? 'tabular text-danger' : 'tabular font-medium'}>{p.direction === 'out' ? '−' : ''}{priceOf(p.amountMinor, p.currency, locale)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {c.notes && <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-fg-muted">{c.notes}</p>}
        </div>
        <div className="flex flex-col gap-4">
          {d.followUps.filter((f) => !f.doneAt).length > 0 && (
            <Card>
              <CardHeader title={t('followUps')} />
              <CardBody><ul className="flex flex-col gap-2 text-sm">{d.followUps.filter((f) => !f.doneAt).map((f) => <li key={f.id} className="flex justify-between gap-2"><span>{t(`fu_${f.type}`)} · {f.note || f.entityLabel}</span><span className="flex items-center gap-1">{dt(f.dueAt)}{f.overdue && <Badge tone="danger">{t('overdue')}</Badge>}</span></li>)}</ul></CardBody>
            </Card>
          )}
          <Timeline entity={{ kind: 'customer', id: c.id }} activities={d.activities} canNote={crm} />
        </div>
      </div>
      {edit && <CustomerDialog customer={c} onClose={() => setEdit(false)} />}
      {request && <RequestDialog request={null} party={{ customerId: c.id }} onClose={() => setRequest(false)} />}
    </div>
  );
}

export function CustomersScreen({ segments }: { segments: string[] }) {
  return segments[0] ? <Customer360 id={segments[0]} /> : <CustomersList />;
}
