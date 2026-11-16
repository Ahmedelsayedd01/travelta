'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { subAgencyInputSchema, type OrganizationDto, type SubAgencyInput } from '@travelta/schemas';
import { Plus } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState } from '@/components/feedback/states';
import { Can } from '@/components/portal/guards';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet } from '@/components/ui/sheet';
import { applyFieldErrors, useAction } from '@/lib/mutations';

export function SubAgenciesPage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const api = useApi();
  const state = useListState({ sort: 'name:asc' });
  const result = useQuery({ queryKey: ['subAgencies', state.query], queryFn: () => api.call('subAgencies.list', state.query), placeholderData: keepPreviousData });
  const [creating, setCreating] = useState(false);
  const form = useForm<SubAgencyInput>({
    resolver: zodResolver(subAgencyInputSchema),
    defaultValues: { name: { en: '', ar: '' }, legalName: '', city: '', contactEmail: '', contactPhone: '', owner: { name: '', email: '' } },
  });
  const create = useAction((input: SubAgencyInput) => api.call('subAgencies.create', input), {
    success: (o, input) => t('sub.created', { name: o.name[locale], email: input.owner.email }),
    invalidate: [['subAgencies']],
    onSuccess: () => { form.reset(); setCreating(false); },
  });
  const submit = form.handleSubmit((v) => create.mutate(v, { onError: (e) => applyFieldErrors(e, form.setError) }));
  const e = form.formState.errors;

  const columns: Column<OrganizationDto>[] = [
    { key: 'name', header: t('org.name'), sortKey: 'name', cell: (o) => <span className="font-medium">{o.name[locale]}</span> },
    { key: 'city', header: t('org.city'), cell: (o) => o.city },
    { key: 'status', header: t('org.status'), cell: (o) => <StatusBadge kind="orgStatus" value={o.status} /> },
    { key: 'members', header: t('org.members'), numeric: true, cell: (o) => o.memberCount },
    { key: 'contact', header: t('org.contact'), hideOnCard: true, cell: (o) => <span dir="ltr">{o.contactEmail}</span> },
    { key: 'created', header: t('org.created'), sortKey: 'createdAt', cell: (o) => format.dateTime(new Date(o.createdAt), { dateStyle: 'medium' }) },
  ];

  return (
    <>
      <PageHeader title={t('sub.title')} description={t('sub.description')}
        actions={<Can permission="sub_agencies.manage"><Button onClick={() => setCreating(true)}><Plus aria-hidden />{t('sub.create')}</Button></Can>} />
      <DataTable label={t('sub.title')} testId="sub-agencies-table" state={state} result={result} columns={columns} rowKey={(o) => o.id}
        empty={<EmptyState title={t('sub.title')} body={t('sub.description')} />} />
      <Sheet open={creating} onOpenChange={setCreating} title={t('sub.createTitle')} description={t('sub.createHelp')}
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>{t('common.cancel')}</Button><Button loading={create.isPending} onClick={() => void submit()}>{t('common.create')}</Button></>}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-fg">{t('sub.company')}</legend>
            <Field label={t('settings.nameEn')} required error={e.name?.en?.message}><Input {...form.register('name.en')} /></Field>
            <Field label={t('settings.nameAr')} required error={e.name?.ar?.message}><Input dir="rtl" {...form.register('name.ar')} /></Field>
            <Field label={t('settings.legalName')} required error={e.legalName?.message}><Input {...form.register('legalName')} /></Field>
            <Field label={t('settings.city')} required error={e.city?.message}><Input {...form.register('city')} /></Field>
            <Field label={t('settings.contactEmail')} required error={e.contactEmail?.message}><Input type="email" dir="ltr" {...form.register('contactEmail')} /></Field>
            <Field label={t('settings.contactPhone')} required error={e.contactPhone?.message}><Input type="tel" dir="ltr" {...form.register('contactPhone')} /></Field>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-fg">{t('sub.owner')}</legend>
            <Field label={t('sub.ownerName')} required error={e.owner?.name?.message}><Input {...form.register('owner.name')} /></Field>
            <Field label={t('sub.ownerEmail')} required error={e.owner?.email?.message}><Input type="email" dir="ltr" {...form.register('owner.email')} /></Field>
          </fieldset>
        </form>
      </Sheet>
    </>
  );
}
