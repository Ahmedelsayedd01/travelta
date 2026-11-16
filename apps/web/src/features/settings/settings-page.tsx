'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CURRENCY_CODES } from '@travelta/contracts';
import { organizationProfileInputSchema, type OrganizationDto, type OrganizationProfileInput } from '@travelta/schemas';
import { useFormatter, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useApi } from '@/components/api-provider';
import { DemoBadge } from '@/components/feedback/markers';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { DesignSystemShowcase } from '@/features/design-system/showcase';
import { applyFieldErrors, useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

/**
 * Organization profile. Without `target` the session's own organization (orgs.updateMyProfile); with `target`
 * the platform edits another tenant (orgs.update — organizations.manage, audited).
 */
export function OrganizationProfileForm({ target, onSaved }: { target?: OrganizationDto; onSaved?: () => void } = {}) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const api = useApi();
  const own = useQuery({ queryKey: ['orgs', 'me'], enabled: !target, queryFn: () => api.call('orgs.myProfile') });
  const profile = target ? { data: target } : own;
  const form = useForm<OrganizationProfileInput>({ resolver: zodResolver(organizationProfileInputSchema) });
  useEffect(() => {
    if (profile.data) {
      const { name, legalName, city, contactEmail, contactPhone, baseCurrency } = profile.data;
      form.reset({ name, legalName, city, contactEmail, contactPhone, baseCurrency });
    }
  }, [profile.data, form]);
  const save = useAction((input: OrganizationProfileInput) => (target ? api.call('orgs.update', { ...input, id: target.id }) : api.call('orgs.updateMyProfile', input)),
    { success: t('saved'), invalidate: [['orgs']], onSuccess: () => onSaved?.() });
  const submit = form.handleSubmit((v) => save.mutate(v, { onError: (e) => applyFieldErrors(e, form.setError) }));
  const e = form.formState.errors;

  if (!profile.data) return <Skeleton className="h-64 w-full" />;
  return (
    <Card>
      <CardHeader title={t('tabOrganization')} description={profile.data.legalName} />
      <CardBody>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2" data-testid="org-profile-form">
          <Field label={t('nameEn')} required error={e.name?.en?.message}><Input {...form.register('name.en')} /></Field>
          <Field label={t('nameAr')} required error={e.name?.ar?.message}><Input dir="rtl" {...form.register('name.ar')} /></Field>
          <Field label={t('legalName')} required error={e.legalName?.message}><Input {...form.register('legalName')} /></Field>
          <Field label={t('city')} required error={e.city?.message}><Input {...form.register('city')} /></Field>
          <Field label={t('contactEmail')} required error={e.contactEmail?.message}><Input type="email" dir="ltr" {...form.register('contactEmail')} /></Field>
          <Field label={t('contactPhone')} required error={e.contactPhone?.message}><Input type="tel" dir="ltr" {...form.register('contactPhone')} /></Field>
          <Field label={t('baseCurrency')}><Select {...form.register('baseCurrency')}>{CURRENCY_CODES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <div className="flex items-end justify-end sm:col-span-2">
            <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>{tc('save')}</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function CurrenciesPanel() {
  const t = useTranslations('settings');
  const format = useFormatter();
  const api = useApi();
  const toEgp = useQuery({ queryKey: ['fx', 'toEgp'], queryFn: async () => Promise.all((['USD', 'SAR', 'EUR'] as const).map((b) => api.call('fx.latest', { base: b }))) });
  return (
    <Card>
      <CardHeader title={t('tabCurrencies')} description={t('ratesHelp')} actions={<DemoBadge />} />
      <CardBody>
        {!toEgp.data ? <Skeleton className="h-40 w-full" /> : (
          <Table data-testid="fx-table">
            <THead><tr><Th>{t('pair')}</Th><Th numeric>{t('rate')}</Th><Th>{t('asOf')}</Th></tr></THead>
            <TBody>
              {toEgp.data.flat().filter((r) => r.quote === 'EGP').map((r) => (
                <Tr key={r.id}>
                  <Td dir="ltr" className="font-medium">1 {r.base} = EGP</Td>
                  <Td numeric>{format.number(r.rate, { maximumFractionDigits: 4 })}</Td>
                  <Td>{format.dateTime(new Date(r.date), { dateStyle: 'medium' })}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Settings (settings.manage). Platform admins additionally get the Design system — moved here from the public site
 * (decision 15 Nov 2026) — and the currency/FX view.
 */
export function SettingsPage() {
  const t = useTranslations('settings');
  const isPlatform = useSession((s) => s.session?.organization.type === 'platform');
  const params = useSearchParams();
  const tab = params.get('tab') ?? 'organization';
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs defaultValue={['organization', 'design', 'currencies'].includes(tab) ? tab : 'organization'}>
        <TabsList>
          <Tab value="organization">{t('tabOrganization')}</Tab>
          <Tab value="currencies">{t('tabCurrencies')}</Tab>
          {isPlatform && <Tab value="design" data-testid="tab-design">{t('tabDesign')}</Tab>}
        </TabsList>
        <TabsPanel value="organization"><OrganizationProfileForm /></TabsPanel>
        <TabsPanel value="currencies"><CurrenciesPanel /></TabsPanel>
        {isPlatform && (
          <TabsPanel value="design">
            <p className="mb-6 text-sm text-fg-muted">{t('designHelp')}</p>
            <DesignSystemShowcase embedded />
          </TabsPanel>
        )}
      </Tabs>
    </>
  );
}
