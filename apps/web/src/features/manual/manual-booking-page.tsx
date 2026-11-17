'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES, type ServiceType } from '@travelta/contracts';
import type { ManualItemInput } from '@travelta/schemas';
import { ArrowLeft, ArrowRight, ShoppingCart } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { SERVICE_ICONS } from '@/components/brand/brand';
import { PriceBreakdownView } from '@/components/data/price-breakdown';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/ui/stepper';
import { useDemoToday } from '@/features/demo/hooks';
import { useRouter } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { addDays } from '@travelta/shared';
import { cn } from '@/lib/cn';

interface Draft {
  serviceType: ServiceType;
  supplierKind: 'own' | 'network';
  supplierId: string;
  title: string;
  destinationId: string;
  from: string;
  to: string;
  adults: number;
  children: number;
  infants: number;
  description: string;
  cost: string;
  currency: 'EGP' | 'USD' | 'SAR' | 'EUR';
  markupMode: 'percent' | 'fixed';
  markup: string;
  taxProfileId: string;
  nonRefundable: boolean;
  feeDays: string;
  feePct: string;
  customerType: 'individual' | 'corporate' | 'vip';
}

const STORAGE = 'travelta:manual-booking-draft';
const RANGE_SERVICES: ServiceType[] = ['hotel', 'tour', 'umrah'];

const blank = (today: string): Draft => ({
  serviceType: 'hotel', supplierKind: 'own', supplierId: '', title: '', destinationId: '', from: addDays(today, 14), to: addDays(today, 16),
  adults: 2, children: 0, infants: 0, description: '', cost: '', currency: 'EGP', markupMode: 'percent', markup: '15', taxProfileId: '',
  nonRefundable: false, feeDays: '7', feePct: '50', customerType: 'individual',
});

function loadDraft(today: string, userId: string | undefined): Draft {
  try {
    const raw = localStorage.getItem(`${STORAGE}:${userId}`);
    if (raw) return { ...blank(today), ...(JSON.parse(raw) as Partial<Draft>) };
  } catch { /* storage unavailable: start fresh */ }
  return blank(today);
}

function toInput(d: Draft): ManualItemInput | null {
  const net = Math.round(Number(d.cost) * 100);
  if (!d.supplierId || d.title.trim().length < 2 || !(net > 0) || d.markup === '') return null;
  const range = RANGE_SERVICES.includes(d.serviceType);
  return {
    serviceType: d.serviceType, supplier: { kind: d.supplierKind, id: d.supplierId }, title: d.title.trim(), destinationId: d.destinationId || null,
    from: d.from, to: range ? d.to : null,
    occupancy: { adults: d.adults, children: d.children, infants: d.serviceType === 'hotel' ? 0 : d.infants, rooms: [] },
    netMinor: net, netCurrency: d.currency,
    markup: { mode: d.markupMode, value: d.markupMode === 'fixed' ? Math.round(Number(d.markup) * 100) / 100 : Number(d.markup) },
    taxProfileId: d.taxProfileId || null,
    policy: d.nonRefundable ? { nonRefundable: true, rules: [] } : { nonRefundable: false, rules: [{ daysBefore: Number(d.feeDays || 0), feeType: 'percent', value: Number(d.feePct || 0) }] },
    details: d.description ? { description: d.description } : {},
    customerType: d.customerType, channel: 'b2c',
  };
}

/** W3: manual booking from own or network suppliers, priced live by the engine with the agent's markup. */
export function ManualBookingPage() {
  const t = useTranslations('manual');
  const tg = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const router = useRouter();
  const today = useDemoToday();
  const userId = useSession((s) => s.session?.user.id);
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => loadDraft(today, userId));
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  useEffect(() => {
    try { localStorage.setItem(`${STORAGE}:${userId}`, JSON.stringify(d)); } catch { /* best effort */ }
  }, [d, userId]);

  const suppliers = useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => api.call('suppliers.list', { page: 1, pageSize: 100 }) });
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const taxes = useQuery({ queryKey: ['pricing', 'taxProfiles'], queryFn: () => api.call('pricing.taxProfiles.list') });
  const options = suppliers.data?.items.filter((s) => s.kind === d.supplierKind && s.status === 'active' && s.serviceTypes.includes(d.serviceType)) ?? [];
  const input = toInput(d);
  const preview = useQuery({
    queryKey: ['manual', 'preview', input],
    enabled: input !== null,
    queryFn: () => api.call('cart.previewManual', input!),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const add = useAction((i: ManualItemInput) => api.call('cart.addManual', i), { invalidate: [['cart']] });
  const submit = (thenCheckout: boolean) => {
    if (!input) return;
    add.mutate(input, {
      onSuccess: () => {
        toast.success(t('added'));
        try { localStorage.removeItem(`${STORAGE}:${userId}`); } catch { /* ignore */ }
        setD(blank(today));
        setStep(0);
        if (thenCheckout) router.push('/agency/checkout');
      },
    });
  };
  const range = RANGE_SERVICES.includes(d.serviceType);
  const steps = [t('stepService'), t('stepDetails'), t('stepPricing')];
  const canNext = step === 0 ? Boolean(d.supplierId) : step === 1 ? d.title.trim().length >= 2 && (!range || d.to >= d.from) : true;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Stepper steps={steps} current={step} className="mb-6" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card data-testid={`manual-step-${step}`}>
          <CardHeader title={steps[step]} />
          <CardBody className="flex flex-col gap-5">
            {step === 0 && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={tg('catalog.service')}>
                  {SERVICE_TYPES.map((s) => {
                    const Icon = SERVICE_ICONS[s];
                    return (
                      <button key={s} type="button" role="radio" aria-checked={d.serviceType === s} data-service={s}
                        onClick={() => set({ serviceType: s, supplierId: '' })}
                        className={cn('flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm font-medium', d.serviceType === s ? 'border-primary bg-primary-soft/40 text-fg ring-1 ring-primary' : 'border-border text-fg-muted hover:bg-subtle')}>
                        <Icon className="size-5" aria-hidden />{tg(`enums.serviceType.${s}`)}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('supplierKind')}>
                    <Select name="supplierKind" value={d.supplierKind} onChange={(e) => set({ supplierKind: e.target.value as Draft['supplierKind'], supplierId: '' })}>
                      <option value="own">{t('ownSupplier')}</option><option value="network">{t('networkSupplier')}</option>
                    </Select>
                  </Field>
                  <Field label={t('supplier')} required help={suppliers.data && options.length === 0 ? t('noSuppliers') : undefined}>
                    <Select name="supplierId" value={d.supplierId} onChange={(e) => set({ supplierId: e.target.value })} disabled={!suppliers.data}>
                      <option value="">—</option>
                      {options.map((s) => <option key={s.id} value={s.id}>{s.name[locale]}</option>)}
                    </Select>
                  </Field>
                </div>
              </>
            )}
            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('itemTitle')} required help={t('itemTitleHint')} className="sm:col-span-2"><Input name="title" value={d.title} onChange={(e) => set({ title: e.target.value })} /></Field>
                <Field label={t('destination')} optional>
                  <Select name="destinationId" value={d.destinationId} onChange={(e) => set({ destinationId: e.target.value })}>
                    <option value="">{t('anyDestination')}</option>
                    {destinations.data?.items.map((x) => <option key={x.id} value={x.id}>{x.name[locale]}</option>)}
                  </Select>
                </Field>
                <Field label={tg('search.customerType')}>
                  <Select value={d.customerType} onChange={(e) => set({ customerType: e.target.value as Draft['customerType'] })}>
                    {(['individual', 'corporate', 'vip'] as const).map((c) => <option key={c} value={c}>{tg(`enums.customerType.${c}`)}</option>)}
                  </Select>
                </Field>
                <Field label={t('startDate')} required><DateInput name="from" min={today} value={d.from} onChange={(e) => set({ from: e.target.value, to: e.target.value > d.to ? e.target.value : d.to })} /></Field>
                {range && <Field label={t('endDate')} required error={d.to < d.from ? 'validation.invalid_date' : undefined}><DateInput name="to" min={d.from} value={d.to} onChange={(e) => set({ to: e.target.value })} /></Field>}
                <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                  <Field label={tg('search.adults')}><Input type="number" min={1} max={30} name="adults" value={d.adults} onChange={(e) => set({ adults: Math.max(1, Number(e.target.value) || 1) })} /></Field>
                  <Field label={tg('search.children')}><Input type="number" min={0} max={20} name="children" value={d.children} onChange={(e) => set({ children: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                  {d.serviceType !== 'hotel' && <Field label={tg('search.infants')}><Input type="number" min={0} max={10} name="infants" value={d.infants} onChange={(e) => set({ infants: Math.max(0, Number(e.target.value) || 0) })} /></Field>}
                </div>
                <Field label={t('voucherDescription')} optional className="sm:col-span-2"><Input name="description" value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field>
              </div>
            )}
            {step === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('cost')} required><Input type="number" step="0.01" min={0} name="cost" value={d.cost} onChange={(e) => set({ cost: e.target.value })} /></Field>
                <Field label={t('costCurrency')}>
                  <Select name="currency" value={d.currency} onChange={(e) => set({ currency: e.target.value as Draft['currency'] })}>{(['EGP', 'USD', 'SAR', 'EUR'] as const).map((c) => <option key={c}>{c}</option>)}</Select>
                </Field>
                <Field label={t('markupMode')}>
                  <Select name="markupMode" value={d.markupMode} onChange={(e) => set({ markupMode: e.target.value as Draft['markupMode'] })}>
                    <option value="percent">{t('percent')}</option><option value="fixed">{t('fixed')}</option>
                  </Select>
                </Field>
                <Field label={`${t('markupValue')} ${d.markupMode === 'percent' ? '(%)' : ''}`} required><Input type="number" step="0.01" min={0} name="markup" value={d.markup} onChange={(e) => set({ markup: e.target.value })} /></Field>
                <Field label={t('tax')} className="sm:col-span-2">
                  <Select name="taxProfileId" value={d.taxProfileId} onChange={(e) => set({ taxProfileId: e.target.value })}>
                    <option value="">{t('noTax')}</option>
                    {taxes.data?.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.rateBp / 100}%)</option>)}
                  </Select>
                </Field>
                <Field label={t('policy')}>
                  <Select name="policy" value={d.nonRefundable ? 'nr' : 'r'} onChange={(e) => set({ nonRefundable: e.target.value === 'nr' })}>
                    <option value="r">{t('refundable')}</option><option value="nr">{t('nonRefundable')}</option>
                  </Select>
                </Field>
                {!d.nonRefundable && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('feeDays')}><Input type="number" min={0} name="feeDays" value={d.feeDays} onChange={(e) => set({ feeDays: e.target.value })} /></Field>
                    <Field label={t('feePct')}><Input type="number" min={0} max={100} name="feePct" value={d.feePct} onChange={(e) => set({ feePct: e.target.value })} /></Field>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft className="flip-rtl" aria-hidden />{tg('checkout.back')}</Button>
              {step < 2 ? (
                <Button onClick={() => setStep(step + 1)} disabled={!canNext} data-testid="manual-next">{tg('checkout.next')}<ArrowRight className="flip-rtl" aria-hidden /></Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={!input || preview.isError} loading={add.isPending} onClick={() => submit(false)} data-testid="manual-add"><ShoppingCart aria-hidden />{t('add')}</Button>
                  <Button disabled={!input || preview.isError} loading={add.isPending} onClick={() => submit(true)} data-testid="manual-add-checkout">{t('addAndCheckout')}</Button>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
        <Card className="self-start xl:sticky xl:top-20">
          <CardHeader title={t('preview')} />
          <CardBody data-testid="manual-preview">
            {!input ? <p className="text-sm text-fg-muted">{t('previewHint')}</p>
              : preview.isError ? <p role="alert" className="text-sm text-danger">{tg('errors.VALIDATION_ERROR')}</p>
              : !preview.data ? <Skeleton className="h-64 w-full" /> : <PriceBreakdownView breakdown={preview.data.breakdown} />}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
