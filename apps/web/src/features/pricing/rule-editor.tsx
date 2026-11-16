'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CURRENCY_CODES, INVENTORY_SOURCES, SERVICE_TYPES } from '@travelta/contracts';
import { customerTypeSchema, markupRuleInputSchema, type MarkupRuleEntity, type MarkupRuleInput } from '@travelta/schemas';
import { toMinor } from '@travelta/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useForm, type Resolver } from 'react-hook-form';
import { useApi } from '@/components/api-provider';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { applyFieldErrors, useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

function Chips<T extends string>({ label, options, value, onChange, render }: { label: string; options: readonly T[]; value: T[] | undefined; onChange: (v: T[]) => void; render: (o: T) => string }) {
  const selected = new Set(value ?? []);
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-fg">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o);
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? [...selected].filter((x) => x !== o) : [...selected, o])}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-fg hover:bg-subtle')}>
              {render(o)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Create/edit a markup rule. Saving creates a new rule version; the previous one stays for bookings that used it. */
export function RuleEditor({ rule, onClose }: { rule: MarkupRuleEntity | null; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const api = useApi();
  const org = useSession((s) => s.session?.organization);
  const isPlatform = org?.type === 'platform';
  const isSub = org?.parentId != null;
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const targets = useQuery({
    queryKey: ['pricing', 'targets', isPlatform],
    enabled: !isSub,
    queryFn: () => (isPlatform ? api.call('orgs.list', { page: 1, pageSize: 100, filters: { type: 'agency' } }) : api.call('subAgencies.list', { page: 1, pageSize: 100 })),
  });
  const versions = useQuery({ queryKey: ['pricing', 'versions', rule?.id], enabled: rule !== null, queryFn: () => api.call('pricing.rules.versions', { ruleId: rule!.id }) });
  const settings = useQuery({ queryKey: ['commercialSettings'], queryFn: () => api.call('commercialSettings.get') });

  const form = useForm<MarkupRuleInput>({
    resolver: zodResolver(markupRuleInputSchema) as Resolver<MarkupRuleInput>,
    defaultValues: rule
      ? { id: rule.id, name: rule.name, status: rule.status, match: rule.match, mode: rule.mode, value: rule.value, fixedCurrency: rule.fixedCurrency, fixedPer: rule.fixedPer, minAmountMinor: rule.minAmountMinor, maxAmountMinor: rule.maxAmountMinor, priority: rule.priority }
      : { name: '', status: 'active', match: {}, mode: 'percent', value: 0, priority: 10 },
  });
  const mode = form.watch('mode');
  const match = form.watch('match');
  const setMatch = (patch: Partial<MarkupRuleInput['match']>) => form.setValue('match', { ...match, ...patch }, { shouldDirty: true });
  const save = useAction((input: MarkupRuleInput) => api.call('pricing.rules.save', input), {
    success: (r) => t('pricing.ruleSaved', { n: r.ruleVersion }), invalidate: [['pricing']], onSuccess: onClose,
  });
  const submit = form.handleSubmit((v) => save.mutate(v, { onError: (e) => applyFieldErrors(e, form.setError) }));
  const e = form.formState.errors;
  const g = settings.data?.defaultGuardrail;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} size="lg" title={rule ? t('pricing.editRule') : t('pricing.newRule')} description={t('pricing.specificityHint')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => void submit()} data-testid="rule-save">{t('common.save')}</Button></>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5" data-testid="rule-editor">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field className="sm:col-span-2" label={t('pricing.rule')} required error={e.name?.message}><Input {...form.register('name')} /></Field>
          <Field label={t('pricing.status')}><Select {...form.register('status')}><option value="active">{t('pricing.active')}</option><option value="inactive">{t('pricing.inactive')}</option></Select></Field>
          <Field label={t('pricing.mode')}><Select {...form.register('mode')}><option value="percent">{t('enums.markupMode.percent')}</option><option value="fixed">{t('enums.markupMode.fixed')}</option></Select></Field>
          <Field label={t('pricing.value')} required error={e.value?.message} help={!isPlatform && mode === 'percent' && g ? t('pricing.guardrailHint', { min: g.minPct, max: g.maxPct }) : undefined}>
            <Input type="number" step="0.01" min={0} {...form.register('value', { valueAsNumber: true })} />
          </Field>
          <Field label={t('pricing.priority')}><Input type="number" min={0} max={1000} {...form.register('priority', { valueAsNumber: true })} /></Field>
          {mode === 'fixed' && (
            <>
              <Field label={t('pricing.fixedCurrency')} required error={e.fixedCurrency?.message}>
                <Select {...form.register('fixedCurrency')}><option value="">—</option>{CURRENCY_CODES.map((c) => <option key={c}>{c}</option>)}</Select>
              </Field>
              <Field label={t('pricing.fixedPer')} required>
                <Select {...form.register('fixedPer')}><option value="">—</option><option value="unit">{t('pricing.perUnit')}</option><option value="booking">{t('pricing.perBooking')}</option></Select>
              </Field>
            </>
          )}
          <Field label={t('pricing.minAmount')} optional error={e.minAmountMinor?.message}>
            <Input type="number" step="0.01" min={0} defaultValue={rule?.minAmountMinor !== undefined ? rule.minAmountMinor / 100 : ''}
              onChange={(ev) => form.setValue('minAmountMinor', ev.target.value === '' ? undefined : toMinor(ev.target.value, 'EGP'))} />
          </Field>
          <Field label={t('pricing.maxAmount')} optional error={e.maxAmountMinor?.message}>
            <Input type="number" step="0.01" min={0} defaultValue={rule?.maxAmountMinor !== undefined ? rule.maxAmountMinor / 100 : ''}
              onChange={(ev) => form.setValue('maxAmountMinor', ev.target.value === '' ? undefined : toMinor(ev.target.value, 'EGP'))} />
          </Field>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <p className="text-sm font-semibold text-fg">{t('pricing.scope')}</p>
          <Chips label={t('pricing.services')} options={SERVICE_TYPES} value={match.serviceTypes} onChange={(v) => setMatch({ serviceTypes: v })} render={(o) => t(`enums.serviceType.${o}`)} />
          <Chips label={t('pricing.sources')} options={INVENTORY_SOURCES} value={match.sources} onChange={(v) => setMatch({ sources: v })} render={(o) => t(`enums.inventorySource.${o}`)} />
          <Chips label={t('pricing.customerTypes')} options={customerTypeSchema.options} value={match.customerTypes} onChange={(v) => setMatch({ customerTypes: v })} render={(o) => t(`enums.customerType.${o}`)} />
          {!isSub && targets.data && targets.data.items.length > 0 && (
            <Chips label={isPlatform ? t('pricing.targetAgencies') : t('pricing.targetSubAgencies')} options={targets.data.items.map((o) => o.id)} value={match.targetAgencyIds}
              onChange={(v) => setMatch({ targetAgencyIds: v })} render={(id) => targets.data!.items.find((o) => o.id === id)?.name[locale] ?? id} />
          )}
          {destinations.data && (
            <Chips label={t('pricing.destinations')} options={destinations.data.items.map((d) => d.id)} value={match.destinationIds}
              onChange={(v) => setMatch({ destinationIds: v })} render={(id) => destinations.data!.items.find((d) => d.id === id)?.name[locale] ?? id} />
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('pricing.channel')}>
              <Select value={match.channel ?? ''} onChange={(ev) => setMatch({ channel: (ev.target.value || undefined) as 'b2b' | 'b2c' | undefined })}>
                <option value="">{t('pricing.anyChannel')}</option><option value="b2b">B2B</option><option value="b2c">B2C</option>
              </Select>
            </Field>
            <Field label={t('pricing.travelFrom')} optional><Input type="date" value={match.travelWindow?.from ?? ''} onChange={(ev) => setMatch({ travelWindow: { ...match.travelWindow, from: ev.target.value || undefined } })} /></Field>
            <Field label={t('pricing.travelTo')} optional><Input type="date" value={match.travelWindow?.to ?? ''} onChange={(ev) => setMatch({ travelWindow: { ...match.travelWindow, to: ev.target.value || undefined } })} /></Field>
          </div>
        </div>

        {rule && versions.data && versions.data.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-fg">{t('pricing.versions')}</p>
            <ol className="flex flex-col gap-1 text-sm" data-testid="rule-versions">
              {versions.data.map((v) => (
                <li key={v.id} className="flex justify-between gap-3 rounded-md bg-subtle px-3 py-1.5">
                  <span>{t('pricing.version', { n: v.ruleVersion })} · {v.snapshot.mode === 'percent' ? `${v.snapshot.value}%` : `${v.snapshot.value} ${v.snapshot.fixedCurrency}/${v.snapshot.fixedPer}`}</span>
                  <span className="text-fg-muted">{format.dateTime(new Date(v.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </form>
    </Sheet>
  );
}
