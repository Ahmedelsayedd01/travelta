'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { BulkUpdateInput } from '@travelta/schemas';
import { addDays, formatMoney, money } from '@travelta/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { EmptyState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAction } from '@/lib/mutations';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/cn';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const daysInMonth = (first: string) => new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)).getUTCDate();
const shiftMonth = (first: string, n: number) => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/** Rates & availability (W9): month grid per option + bulk edit by range and weekdays. */
export function RatesPage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const api = useApi();
  const canManage = useCan('inventory.manage');
  const params = useSearchParams();
  const products = useQuery({ queryKey: ['catalog', 'all-own'], queryFn: () => api.call('catalog.list', { page: 1, pageSize: 100 }) });
  const [productId, setProductId] = useState<string>(params.get('product') ?? '');
  const selectedId = productId || products.data?.items[0]?.id || '';
  const product = useQuery({ queryKey: ['catalog', 'product', selectedId], enabled: Boolean(selectedId), queryFn: () => api.call('catalog.get', { id: selectedId }) });
  const [unitPick, setUnitPick] = useState('');
  const unitId = unitPick && product.data?.units.some((u) => u.id === unitPick) ? unitPick : (product.data?.units[0]?.id ?? '');
  const [month, setMonth] = useState(monthStart(new Date().toISOString()));
  const days = daysInMonth(month);
  const calendar = useQuery({
    queryKey: ['catalog', 'calendar', selectedId, unitId, month],
    enabled: Boolean(selectedId && unitId),
    queryFn: () => api.call('inventory.calendar', { productId: selectedId, unitId, from: month, days }),
    placeholderData: keepPreviousData,
  });

  const [bulk, setBulk] = useState({ from: month, to: addDays(month, 6), weekdays: [] as number[], allotment: '', net: '', sale: 'keep' as 'keep' | 'stop' | 'open' });
  const apply = useAction((input: BulkUpdateInput) => api.call('inventory.bulkUpdate', input), {
    success: (r) => t('catalog.bulkDone', { count: r.updatedDays }), invalidate: [['catalog', 'calendar']],
  });
  const currency = product.data?.currency ?? 'EGP';
  const lead = new Date(`${month}T00:00:00Z`).getUTCDay();

  if (products.data && products.data.items.length === 0) return (<><PageHeader title={t('catalog.ratesTitle')} /><EmptyState /></>);
  return (
    <>
      <PageHeader title={t('catalog.ratesTitle')} description={t('catalog.ratesDescription')} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('catalog.chooseProduct')} className="min-w-64">
          <Select value={selectedId} onChange={(e) => { setProductId(e.target.value); setUnitPick(''); }} data-testid="rates-product">
            {products.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name[locale]}</option>)}
          </Select>
        </Field>
        <Field label={t('catalog.chooseUnit')} className="min-w-56">
          <Select value={unitId} onChange={(e) => setUnitPick(e.target.value)}>{product.data?.units.map((u) => <option key={u.id} value={u.id}>{u.name[locale]}</option>)}</Select>
        </Field>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <Card>
          <CardHeader
            title={format.dateTime(new Date(`${month}T00:00:00Z`), { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            actions={<div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('catalog.prevMonth')}><ChevronLeft className="flip-rtl" aria-hidden /></Button>
              <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('catalog.nextMonth')}><ChevronRight className="flip-rtl" aria-hidden /></Button>
            </div>} />
          <CardBody>
            {!calendar.data ? <Skeleton className="h-80 w-full" /> : (
              <div className="grid grid-cols-7 gap-1.5" data-testid="rates-calendar">
                {WEEKDAYS.map((w) => <div key={w} className="pb-1 text-center text-xs font-semibold text-fg-muted">{format.dateTime(new Date(Date.UTC(2026, 10, 15 + w)), { weekday: 'short', timeZone: 'UTC' })}</div>)}
                {Array.from({ length: lead }, (_, i) => <div key={`pad${i}`} />)}
                {calendar.data.map((d) => (
                  <div key={d.date} data-date={d.date} className={cn('flex min-h-20 flex-col gap-0.5 rounded-md border p-1.5 text-xs',
                    d.stopSell || !d.offered ? 'border-danger/30 bg-danger-bg/50' : d.available === 0 ? 'border-warning/40 bg-warning-bg/50' : 'border-border bg-surface',
                    d.overridden && 'ring-1 ring-accent')}>
                    <span className="font-semibold text-fg">{Number(d.date.slice(8))}</span>
                    <span className="tabular truncate text-fg">{formatMoney(money(d.netMinor, currency), locale, { compact: true })}</span>
                    <span className="tabular text-fg-muted">{d.stopSell || !d.offered ? t('catalog.closed') : `${d.available}/${d.allotment}`}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {canManage && (
          <Card>
            <CardHeader title={t('catalog.bulkEdit')} />
            <CardBody className="flex flex-col gap-4" data-testid="bulk-edit">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('catalog.dateFrom')}><DateInput name="bulkFrom" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} /></Field>
                <Field label={t('catalog.dateTo')}><DateInput name="bulkTo" value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} /></Field>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-fg">{t('catalog.weekdays')}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((w) => {
                    const on = bulk.weekdays.includes(w);
                    return <button key={w} type="button" aria-pressed={on} data-weekday={w} onClick={() => setBulk({ ...bulk, weekdays: on ? bulk.weekdays.filter((x) => x !== w) : [...bulk.weekdays, w] })}
                      className={cn('rounded-md border px-2 py-1 text-xs font-medium', on ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-fg hover:bg-subtle')}>
                      {format.dateTime(new Date(Date.UTC(2026, 10, 15 + w)), { weekday: 'short', timeZone: 'UTC' })}</button>;
                  })}
                </div>
                <p className="mt-1 text-xs text-fg-muted">{bulk.weekdays.length === 0 ? t('catalog.everyDay') : ''}</p>
              </fieldset>
              <Field label={t('catalog.setAllotment')} optional><Input type="number" min={0} name="bulkAllotment" value={bulk.allotment} placeholder={t('catalog.keepUnchanged')} onChange={(e) => setBulk({ ...bulk, allotment: e.target.value })} /></Field>
              <Field label={`${t('catalog.setNet')} (${currency})`} optional><Input type="number" step="0.01" min={0} name="bulkNet" value={bulk.net} placeholder={t('catalog.keepUnchanged')} onChange={(e) => setBulk({ ...bulk, net: e.target.value })} /></Field>
              <Field label={t('catalog.stopSell')}>
                <Select name="bulkSale" value={bulk.sale} onChange={(e) => setBulk({ ...bulk, sale: e.target.value as 'keep' | 'stop' | 'open' })}>
                  <option value="keep">{t('catalog.keepUnchanged')}</option><option value="stop">{t('catalog.stopSell')}</option><option value="open">{t('catalog.openSale')}</option>
                </Select>
              </Field>
              <Button loading={apply.isPending} disabled={!bulk.allotment && !bulk.net && bulk.sale === 'keep'} data-testid="bulk-apply"
                onClick={() => apply.mutate({
                  productId: selectedId, unitIds: [unitId], from: bulk.from, to: bulk.to, weekdays: bulk.weekdays,
                  set: {
                    ...(bulk.allotment ? { allotment: Number(bulk.allotment) } : {}),
                    ...(bulk.net ? { netMinor: Math.round(Number(bulk.net) * 100) } : {}),
                    ...(bulk.sale !== 'keep' ? { stopSell: bulk.sale === 'stop' } : {}),
                  },
                })}>
                {t('catalog.apply')}
              </Button>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
