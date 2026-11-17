'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CURRENCY_CODES, INVENTORY_SOURCES, SERVICE_TYPES, SUPPLIER_OWNERSHIPS, UNIT_TYPES } from '@travelta/contracts';
import { customerTypeSchema, simulateInputSchema, type SimulateInput, type SimulateOutput } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import { Calculator } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { PriceBreakdownView } from '@/components/data/price-breakdown';
import { DemoBadge } from '@/components/feedback/markers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/input';
import { useErrorMessage } from '@/lib/errors';
import { applyFieldErrors } from '@/lib/mutations';
import { useSession } from '@/lib/session';

/** Pricing simulator (PRICING_ENGINE §10): full waterfall + why each rule matched, redacted to the caller's audience. */
export function PricingSimulator() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const errorMessage = useErrorMessage();
  const org = useSession((s) => s.session?.organization);
  const isPlatform = org?.type === 'platform';
  const agencies = useQuery({ queryKey: ['orgs', 'agencies'], enabled: isPlatform, queryFn: () => api.call('orgs.list', { page: 1, pageSize: 100, filters: { type: 'agency' } }) });
  const subs = useQuery({ queryKey: ['subAgencies', 'all'], enabled: !isPlatform && org?.parentId == null, queryFn: () => api.call('subAgencies.list', { page: 1, pageSize: 100 }) });
  const form = useForm<SimulateInput>({
    resolver: zodResolver(simulateInputSchema) as Resolver<SimulateInput>,
    defaultValues: {
      serviceType: 'hotel', source: 'tbo', ownership: 'api', customerType: 'individual', channel: 'b2b', netAmount: 1000, netCurrency: 'EGP',
      quantity: 1, unitType: 'room_night', targetCurrency: 'EGP', travelDate: addDays(new Date().toISOString().slice(0, 10), 30),
    },
  });
  const sim = useMutation<SimulateOutput, unknown, SimulateInput>({ mutationFn: (input) => api.call('pricing.simulate', input) });
  const submit = form.handleSubmit((v) => sim.mutate(
    { ...v, agencyId: v.agencyId || undefined, subAgencyId: v.subAgencyId || undefined, promoCode: v.promoCode?.trim() || undefined },
    { onError: (e) => { if (!applyFieldErrors(e, form.setError)) toast.error(errorMessage(e)); } },
  ));
  const e = form.formState.errors;
  const sel = (name: keyof SimulateInput, options: readonly string[], render: (o: string) => string) => (
    <Select {...form.register(name)}>{options.map((o) => <option key={o} value={o}>{render(o)}</option>)}</Select>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card>
        <CardHeader title={t('pricing.simTitle')} description={t('pricing.simHelp')} />
        <CardBody>
          <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2" data-testid="simulator">
            <Field label={t('designSystem.sampleService')}>{sel('serviceType', SERVICE_TYPES, (o) => t(`enums.serviceType.${o}` as never))}</Field>
            <Field label={t('pricing.ownership')}>{sel('ownership', SUPPLIER_OWNERSHIPS, (o) => t(`enums.supplierOwnership.${o}` as never))}</Field>
            <Field label={t('pricing.sources')}>{sel('source', INVENTORY_SOURCES, (o) => t(`enums.inventorySource.${o}` as never))}</Field>
            <Field label={t('pricing.channel')}>{sel('channel', ['b2b', 'b2c'], (o) => o.toUpperCase())}</Field>
            <Field label={t('pricing.customerTypes')}>{sel('customerType', customerTypeSchema.options, (o) => t(`enums.customerType.${o}` as never))}</Field>
            <Field label={t('pricing.unitType')}>{sel('unitType', UNIT_TYPES, (o) => t(`enums.unitType.${o}` as never))}</Field>
            <Field label={t('pricing.netAmount')} required error={e.netAmount?.message}><Input type="number" step="0.01" min={0} {...form.register('netAmount', { valueAsNumber: true })} /></Field>
            <Field label={t('suppliers.currency')}>{sel('netCurrency', CURRENCY_CODES, (o) => o)}</Field>
            <Field label={t('pricing.quantity')} error={e.quantity?.message}><Input type="number" min={1} max={99} {...form.register('quantity', { valueAsNumber: true })} /></Field>
            <Field label={t('pricing.targetCurrency')}>{sel('targetCurrency', CURRENCY_CODES, (o) => o)}</Field>
            <Field label={t('pricing.travelDate')} error={e.travelDate?.message}><DateInput {...form.register('travelDate')} /></Field>
            <Field label={t('pricing.promoCode')} optional error={e.promoCode?.message}><Input dir="ltr" {...form.register('promoCode')} /></Field>
            {isPlatform && agencies.data && (
              <Field className="sm:col-span-2" label={t('pricing.agency')}>
                <Select {...form.register('agencyId')}><option value="">Travelta Direct</option>{agencies.data.items.filter((a) => !a.isPlatformRetail).map((a) => <option key={a.id} value={a.id}>{a.name[locale]}</option>)}</Select>
              </Field>
            )}
            {!isPlatform && subs.data && subs.data.items.length > 0 && (
              <Field className="sm:col-span-2" label={t('pricing.subAgency')} optional>
                <Select {...form.register('subAgencyId')}><option value="">—</option>{subs.data.items.map((a) => <option key={a.id} value={a.id}>{a.name[locale]}</option>)}</Select>
              </Field>
            )}
            <Button type="submit" className="sm:col-span-2" loading={sim.isPending} data-testid="simulate"><Calculator aria-hidden />{t('pricing.calculate')}</Button>
          </form>
        </CardBody>
      </Card>

      <div className="flex flex-col gap-4">
        {sim.data && (
          <>
            <Card>
              <CardHeader title={t('pricing.breakdown')} actions={<DemoBadge />} />
              <CardBody><PriceBreakdownView breakdown={sim.data.breakdown} /></CardBody>
            </Card>
            <Card>
              <CardHeader title={t('pricing.resolution')} />
              <CardBody>
                <ul className="flex flex-col gap-2 text-sm" data-testid="resolution">
                  {sim.data.resolution.map((r) => (
                    <li key={r.layer} className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral" className="min-w-24 justify-center">{t(`enums.markupLayer.${r.layer}`)}</Badge>
                      <span className="font-medium text-fg">{r.source === 'rule' ? r.ruleName : t(`pricing.src${r.source.charAt(0).toUpperCase()}${r.source.slice(1)}` as never)}</span>
                      {r.score !== null && <span className="text-xs text-fg-muted">{t('pricing.score', { n: r.score })}</span>}
                      {r.alsoMatched.length > 0 && <span className="text-xs text-fg-muted">· {t('pricing.alsoMatched')}: {r.alsoMatched.map((a) => a.name).join(', ')}</span>}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
