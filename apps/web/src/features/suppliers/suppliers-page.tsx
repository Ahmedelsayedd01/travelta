'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CURRENCY_CODES, SERVICE_TYPES, type ServiceType } from '@travelta/contracts';
import { agencySupplierInputSchema, contractInputSchema, type AgencySupplierInput, type ContractInput, type SupplierDto } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import { FileSignature, Pencil, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { DemoBadge } from '@/components/feedback/markers';
import { Can } from '@/components/portal/guards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-picker';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet } from '@/components/ui/sheet';
import { applyFieldErrors, useAction } from '@/lib/mutations';
import { useCan, useSession } from '@/lib/session';

export function SuppliersPage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const isPlatform = useSession((s) => s.session?.organization.type === 'platform');
  const canManage = useCan('suppliers.manage');
  const state = useListState({ sort: 'name:asc' });
  const result = useQuery({ queryKey: ['suppliers', state.query], queryFn: () => api.call('suppliers.list', state.query), placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<SupplierDto | 'new' | null>(null);
  const [contractFor, setContractFor] = useState<SupplierDto | null>(null);

  const columns: Column<SupplierDto>[] = [
    { key: 'name', header: t('suppliers.name'), sortKey: 'name', cell: (s) => <span className="font-medium">{s.name[locale]}</span> },
    { key: 'kind', header: t('suppliers.kind'), sortKey: 'kind', cell: (s) => <Badge tone={s.kind === 'network' ? 'accent' : 'neutral'}>{s.kind === 'network' ? t('suppliers.kindNetwork') : t('suppliers.kindOwn')}</Badge> },
    { key: 'services', header: t('suppliers.services'), cell: (s) => s.serviceTypes.map((x) => t(`enums.serviceType.${x}`)).join(' · ') },
    { key: 'currency', header: t('suppliers.currency'), hideOnCard: true, cell: (s) => s.currency },
    { key: 'commission', header: t('suppliers.commission'), numeric: true, cell: (s) => s.activeContract ? (
      <span className="inline-flex items-center gap-1.5">{s.activeContract.commissionPct}%{s.activeContract.isDemoValue && <DemoBadge />}</span>
    ) : (s.kind === 'own' || isPlatform ? <span className="text-fg-muted">{t('suppliers.noContract')}</span> : '—') },
  ];

  return (
    <>
      <PageHeader title={t('suppliers.title')} description={isPlatform ? t('suppliers.descriptionPlatform') : t('suppliers.descriptionAgency')}
        actions={!isPlatform && <Can permission="suppliers.manage"><Button onClick={() => setEditing('new')}><Plus aria-hidden />{t('suppliers.add')}</Button></Can>} />
      <DataTable label={t('suppliers.title')} testId="suppliers-table" state={state} result={result} columns={columns} rowKey={(s) => `${s.kind}:${s.id}`}
        filters={[
          ...(isPlatform ? [] : [{ key: 'kind', label: t('suppliers.kind'), options: [{ value: 'own', label: t('suppliers.kindOwn') }, { value: 'network', label: t('suppliers.kindNetwork') }] }]),
          { key: 'service', label: t('suppliers.services'), options: SERVICE_TYPES.map((v) => ({ value: v, label: t(`enums.serviceType.${v}`) })) },
        ]}
        rowActions={canManage ? (s) => (
          <div className="flex justify-end gap-1">
            {s.kind === 'own' && <Button variant="ghost" size="sm" onClick={() => setEditing(s)}><Pencil aria-hidden />{t('common.edit')}</Button>}
            {(s.kind === 'own' || isPlatform) && <Button variant="outline" size="sm" onClick={() => setContractFor(s)}><FileSignature aria-hidden />{t('suppliers.editContract')}</Button>}
          </div>
        ) : undefined}
      />
      {editing && <SupplierSheetLoader supplierId={editing === 'new' ? null : editing.id} onClose={() => setEditing(null)} />}
      {contractFor && <ContractSheet supplier={contractFor} onClose={() => setContractFor(null)} />}
    </>
  );
}

/** Loads the full own-supplier record (contact, notes) before editing so no field is silently blanked. */
function SupplierSheetLoader({ supplierId, onClose }: { supplierId: string | null; onClose: () => void }) {
  const api = useApi();
  const existing = useQuery({ queryKey: ['suppliers', 'own', supplierId], enabled: supplierId !== null, queryFn: () => api.call('suppliers.getOwn', { id: supplierId! }) });
  if (supplierId && !existing.data) return null;
  return <SupplierSheet supplier={existing.data ?? null} onClose={onClose} />;
}

function SupplierSheet({ supplier, onClose }: { supplier: (AgencySupplierInput & { id: string }) | null; onClose: () => void }) {
  const t = useTranslations();
  const api = useApi();
  const form = useForm<AgencySupplierInput>({
    resolver: zodResolver(agencySupplierInputSchema) as Resolver<AgencySupplierInput>,
    defaultValues: supplier
      ? { name: supplier.name, serviceTypes: supplier.serviceTypes, contactName: supplier.contactName, email: supplier.email, phone: supplier.phone, currency: supplier.currency, notes: supplier.notes, status: supplier.status }
      : { name: '', serviceTypes: [], contactName: '', email: '', phone: '', currency: 'EGP', notes: '', status: 'active' },
  });
  const services = new Set(form.watch('serviceTypes'));
  const save = useAction((input: AgencySupplierInput) => (supplier ? api.call('suppliers.updateOwn', { ...input, id: supplier.id }) : api.call('suppliers.createOwn', input)), {
    success: t('suppliers.saved'), invalidate: [['suppliers']], onSuccess: onClose,
  });
  const submit = form.handleSubmit((v) => save.mutate(v, { onError: (e) => applyFieldErrors(e, form.setError) }));
  const e = form.formState.errors;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={supplier ? t('suppliers.edit') : t('suppliers.add')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => void submit()}>{t('common.save')}</Button></>}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" label={t('suppliers.name')} required error={e.name?.message}><Input {...form.register('name')} /></Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-fg">{t('suppliers.services')} <span className="text-danger">*</span></legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {SERVICE_TYPES.map((s: ServiceType) => (
              <Checkbox key={s} checked={services.has(s)} label={t(`enums.serviceType.${s}`)}
                onCheckedChange={(on) => form.setValue('serviceTypes', on ? [...services, s] : [...services].filter((x) => x !== s), { shouldValidate: form.formState.isSubmitted })} />
            ))}
          </div>
          {e.serviceTypes && <p role="alert" className="mt-1 text-xs font-medium text-danger">{t('validation.required')}</p>}
        </fieldset>
        <Field label={t('suppliers.contactName')} error={e.contactName?.message}><Input {...form.register('contactName')} /></Field>
        <Field label={t('suppliers.currency')}><Select {...form.register('currency')}>{CURRENCY_CODES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label={t('suppliers.email')} error={e.email?.message}><Input type="email" dir="ltr" {...form.register('email')} /></Field>
        <Field label={t('suppliers.phone')} error={e.phone?.message}><Input type="tel" dir="ltr" {...form.register('phone')} /></Field>
        <Field label={t('suppliers.status')}><Select {...form.register('status')}><option value="active">{t('suppliers.active')}</option><option value="inactive">{t('suppliers.inactive')}</option></Select></Field>
        <Field className="sm:col-span-2" label={t('suppliers.notes')} optional><Textarea {...form.register('notes')} /></Field>
      </form>
    </Sheet>
  );
}

function ContractSheet({ supplier, onClose }: { supplier: SupplierDto; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const today = new Date().toISOString().slice(0, 10);
  const c = supplier.activeContract;
  const form = useForm<ContractInput>({
    resolver: zodResolver(contractInputSchema) as Resolver<ContractInput>,
    defaultValues: c ? { supplier: c.supplier, reference: c.reference, validFrom: c.validFrom, validTo: c.validTo, commissionPct: c.commissionPct, commissionByService: c.commissionByService, payoutDays: c.payoutDays, creditTerms: c.creditTerms, status: c.status }
      : { supplier: { kind: supplier.kind, id: supplier.id }, reference: '', validFrom: today, validTo: addDays(today, 365), commissionPct: 0, commissionByService: {}, payoutDays: 7, creditTerms: '', status: 'active' },
  });
  const save = useAction((input: ContractInput) => api.call('contracts.save', { ...input, id: c?.id }), { success: t('suppliers.contractSaved'), invalidate: [['suppliers']], onSuccess: onClose });
  const submit = form.handleSubmit((v) => save.mutate(v, { onError: (e) => applyFieldErrors(e, form.setError) }));
  const e = form.formState.errors;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={t('suppliers.contractTitle', { name: supplier.name[locale] })} description={t('suppliers.commissionHelp')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => void submit()}>{t('common.save')}</Button></>}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {c?.isDemoValue && <div className="sm:col-span-2"><DemoBadge /></div>}
        <Field label={t('suppliers.reference')} required error={e.reference?.message}><Input dir="ltr" {...form.register('reference')} /></Field>
        <Field label={t('suppliers.contractStatus')}>
          <Select {...form.register('status')}>{(['draft', 'active', 'expired'] as const).map((s) => <option key={s} value={s}>{t(s === 'active' ? 'suppliers.active' : `suppliers.${s}`)}</option>)}</Select>
        </Field>
        <Field label={t('suppliers.validFrom')} required error={e.validFrom?.message}><DateInput {...form.register('validFrom')} /></Field>
        <Field label={t('suppliers.validTo')} required error={e.validTo?.message}><DateInput {...form.register('validTo')} /></Field>
        <Field label={t('suppliers.commissionPct')} required error={e.commissionPct?.message}><Input type="number" step="0.5" min={0} max={50} {...form.register('commissionPct', { valueAsNumber: true })} /></Field>
        <Field label={t('suppliers.payoutDays')} required error={e.payoutDays?.message}><Input type="number" min={0} max={120} {...form.register('payoutDays', { valueAsNumber: true })} /></Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-fg">{t('suppliers.byService')}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {supplier.serviceTypes.map((s) => (
              <Field key={s} label={t(`enums.serviceType.${s}`)}>
                <Input type="number" step="0.5" min={0} max={50} placeholder="—"
                  {...form.register(`commissionByService.${s}`, { setValueAs: (v: string) => (v === '' || v == null ? undefined : Number(v)) })} />
              </Field>
            ))}
          </div>
        </fieldset>
        <Field className="sm:col-span-2" label={t('suppliers.creditTerms')} optional><Textarea {...form.register('creditTerms')} /></Field>
      </form>
    </Sheet>
  );
}
