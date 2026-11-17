'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES } from '@travelta/contracts';
import type { FeeRuleEntity, FeeRuleInput, MarkupRuleEntity, PromoCodeEntity, PromoCodeInput, TaxProfileEntity, TaxProfileInput } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import { Pencil, Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { DemoBadge } from '@/components/feedback/markers';
import { EmptyState } from '@/components/feedback/states';
import { Can } from '@/components/portal/guards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { useAction } from '@/lib/mutations';
import { useCan, useSession } from '@/lib/session';
import { CommercialSettingsForm } from './commercial-settings-page';
import { RuleEditor } from './rule-editor';
import { PricingSimulator } from './simulator';

function RulesTab() {
  const t = useTranslations();
  const api = useApi();
  const state = useListState({ sort: 'updatedAt:desc' });
  const result = useQuery({ queryKey: ['pricing', 'rules', state.query], queryFn: () => api.call('pricing.rules.list', state.query), placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<MarkupRuleEntity | 'new' | null>(null);
  const canManage = useCan('pricing.manage_rules');
  const scope = (r: MarkupRuleEntity) => {
    const parts = [
      ...(r.match.serviceTypes ?? []).map((s) => t(`enums.serviceType.${s}` as never)),
      ...(r.match.customerTypes ?? []).map((c) => t(`enums.customerType.${c}`)),
      ...(r.match.channel ? [r.match.channel.toUpperCase()] : []),
      ...(r.match.targetAgencyIds?.length ? [`${r.match.targetAgencyIds.length} ×  ${t('pricing.agency')}`] : []),
      ...(r.match.destinationIds?.length ? [`${r.match.destinationIds.length} × ${t('pricing.destinations')}`] : []),
    ];
    return parts.length ? parts.join(' · ') : t('pricing.everything');
  };
  const columns: Column<MarkupRuleEntity>[] = [
    { key: 'name', header: t('pricing.rule'), sortKey: 'name', cell: (r) => <span className="inline-flex items-center gap-2 font-medium">{r.name}{r.isDemoValue && <DemoBadge />}</span> },
    { key: 'value', header: t('pricing.value'), sortKey: 'value', cell: (r) => <span dir="ltr" className="tabular">{r.mode === 'percent' ? `${r.value}%` : `${r.value} ${r.fixedCurrency}/${r.fixedPer === 'unit' ? t('pricing.perUnit').split(' ')[0] : t('pricing.perBooking')}`}</span> },
    { key: 'scope', header: t('pricing.scope'), cell: scope },
    { key: 'priority', header: t('pricing.priority'), sortKey: 'priority', numeric: true, hideOnCard: true, cell: (r) => r.priority },
    { key: 'status', header: t('pricing.status'), cell: (r) => <Badge tone={r.status === 'active' ? 'success' : 'neutral'} dot>{t(r.status === 'active' ? 'pricing.active' : 'pricing.inactive')}</Badge> },
    { key: 'version', header: '#', hideOnCard: true, cell: (r) => t('pricing.version', { n: r.ruleVersion }) },
  ];
  return (
    <>
      <DataTable label={t('pricing.tabRules')} testId="rules-table" state={state} result={result} columns={columns} rowKey={(r) => r.id}
        onRowClick={canManage ? (r) => setEditing(r) : undefined}
        filters={[{ key: 'service', label: t('pricing.services'), options: SERVICE_TYPES.map((v) => ({ value: v, label: t(`enums.serviceType.${v}`) })) }]}
        toolbar={<Can permission="pricing.manage_rules"><Button onClick={() => setEditing('new')}><Plus aria-hidden />{t('pricing.newRule')}</Button></Can>}
        rowActions={canManage ? (r) => <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><Pencil aria-hidden />{t('common.edit')}</Button> : undefined}
        empty={<EmptyState title={t('pricing.tabRules')} body={t('pricing.specificityHint')} />} />
      {editing && <RuleEditor rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TaxesFeesTab() {
  const t = useTranslations();
  const api = useApi();
  const taxes = useQuery({ queryKey: ['pricing', 'taxes'], queryFn: () => api.call('pricing.taxProfiles.list') });
  const fees = useQuery({ queryKey: ['pricing', 'fees'], queryFn: () => api.call('pricing.fees.list') });
  const [tax, setTax] = useState<TaxProfileInput | null>(null);
  const [fee, setFee] = useState<FeeRuleInput | null>(null);
  const saveTax = useAction((i: TaxProfileInput) => api.call('pricing.taxProfiles.save', i), { success: t('pricing.saved'), invalidate: [['pricing']], onSuccess: () => setTax(null) });
  const saveFee = useAction((i: FeeRuleInput) => api.call('pricing.fees.save', i), { success: t('pricing.saved'), invalidate: [['pricing']], onSuccess: () => setFee(null) });
  const editTax = (p: TaxProfileEntity) => setTax({ id: p.id, name: p.name, serviceTypes: p.serviceTypes, rateBp: p.rateBp, inclusive: p.inclusive, base: p.base });
  const editFee = (f: FeeRuleEntity) => setFee({ id: f.id, name: f.name, serviceTypes: f.serviceTypes, channel: f.channel, mode: f.mode, value: f.value, per: f.per, taxable: f.taxable, status: f.status });
  const services = (list: string[]) => (list.length ? list.map((s) => t(`enums.serviceType.${s}` as never)).join(' · ') : t('pricing.everything'));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title={t('pricing.taxProfiles')} actions={<Can permission="pricing.manage_rules"><Button size="sm" variant="outline" onClick={() => setTax({ name: '', serviceTypes: [], rateBp: 1400, inclusive: false, base: 'full_price' })}><Plus aria-hidden />{t('pricing.newTax')}</Button></Can>} />
        <CardBody>
          <Table><THead><tr><Th>{t('pricing.rule')}</Th><Th numeric>{t('pricing.rate')}</Th><Th>{t('pricing.services')}</Th><Th /></tr></THead>
            <TBody>{(taxes.data ?? []).map((p) => (
              <Tr key={p.id}><Td className="font-medium">{p.name} {p.inclusive && <Badge tone="info">{t('pricing.inclusive')}</Badge>}</Td><Td numeric>{p.rateBp / 100}%</Td><Td className="text-xs text-fg-muted">{services(p.serviceTypes)}</Td>
                <Td><Can permission="pricing.manage_rules"><Button size="sm" variant="ghost" onClick={() => editTax(p)}><Pencil aria-hidden /></Button></Can></Td></Tr>
            ))}</TBody></Table>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('pricing.feeRules')} actions={<Can permission="pricing.manage_rules"><Button size="sm" variant="outline" onClick={() => setFee({ name: '', serviceTypes: [], channel: 'all', mode: 'fixed', value: 0, per: 'booking', taxable: false, status: 'active' })}><Plus aria-hidden />{t('pricing.newFee')}</Button></Can>} />
        <CardBody>
          {(fees.data ?? []).length === 0 ? <p className="text-sm text-fg-muted">{t('common.emptyBody')}</p> : (
            <Table><THead><tr><Th>{t('pricing.rule')}</Th><Th numeric>{t('pricing.value')}</Th><Th>{t('pricing.channel')}</Th><Th /></tr></THead>
              <TBody>{(fees.data ?? []).map((f) => (
                <Tr key={f.id}><Td className="font-medium">{f.name}</Td><Td numeric>{f.mode === 'percent' ? `${f.value}%` : f.value}</Td><Td>{f.channel.toUpperCase()}</Td>
                  <Td><Can permission="pricing.manage_rules"><Button size="sm" variant="ghost" onClick={() => editFee(f)}><Pencil aria-hidden /></Button></Can></Td></Tr>
              ))}</TBody></Table>
          )}
        </CardBody>
      </Card>

      <Dialog open={tax !== null} onOpenChange={(o) => !o && setTax(null)} title={t('pricing.taxProfiles')}
        footer={<><Button variant="outline" onClick={() => setTax(null)}>{t('common.cancel')}</Button><Button loading={saveTax.isPending} disabled={!tax?.name.trim()} onClick={() => tax && saveTax.mutate(tax)}>{t('common.save')}</Button></>}>
        {tax && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label={t('pricing.rule')} required><Input value={tax.name} onChange={(e) => setTax({ ...tax, name: e.target.value })} /></Field>
            <Field label={t('pricing.rate')}><Input type="number" step="0.01" min={0} max={50} value={tax.rateBp / 100} onChange={(e) => setTax({ ...tax, rateBp: Math.round(Number(e.target.value) * 100) })} /></Field>
            <Field label={t('pricing.taxBase')}><Select value={tax.base} onChange={(e) => setTax({ ...tax, base: e.target.value as 'full_price' | 'margin' })}><option value="full_price">{t('pricing.fullPrice')}</option><option value="margin">{t('pricing.marginOnly')}</option></Select></Field>
            <Checkbox className="sm:col-span-2" checked={tax.inclusive} onCheckedChange={(on) => setTax({ ...tax, inclusive: on })} label={t('pricing.inclusive')} />
            <div className="flex flex-wrap gap-x-4 gap-y-2 sm:col-span-2">
              {SERVICE_TYPES.map((s) => <Checkbox key={s} checked={tax.serviceTypes.includes(s)} label={t(`enums.serviceType.${s}` as never)} onCheckedChange={(on) => setTax({ ...tax, serviceTypes: on ? [...tax.serviceTypes, s] : tax.serviceTypes.filter((x) => x !== s) })} />)}
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={fee !== null} onOpenChange={(o) => !o && setFee(null)} title={t('pricing.feeRules')}
        footer={<><Button variant="outline" onClick={() => setFee(null)}>{t('common.cancel')}</Button><Button loading={saveFee.isPending} disabled={!fee?.name.trim()} onClick={() => fee && saveFee.mutate(fee)}>{t('common.save')}</Button></>}>
        {fee && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label={t('pricing.rule')} required><Input value={fee.name} onChange={(e) => setFee({ ...fee, name: e.target.value })} /></Field>
            <Field label={t('pricing.mode')}><Select value={fee.mode} onChange={(e) => setFee({ ...fee, mode: e.target.value as 'percent' | 'fixed' })}><option value="fixed">{t('enums.markupMode.fixed')}</option><option value="percent">{t('enums.markupMode.percent')}</option></Select></Field>
            <Field label={t('pricing.value')}><Input type="number" step="0.01" min={0} value={fee.value} onChange={(e) => setFee({ ...fee, value: Number(e.target.value) })} /></Field>
            <Field label={t('pricing.fixedPer')}><Select value={fee.per} onChange={(e) => setFee({ ...fee, per: e.target.value as 'unit' | 'booking' })}><option value="booking">{t('pricing.perBooking')}</option><option value="unit">{t('pricing.perUnit')}</option></Select></Field>
            <Field label={t('pricing.channel')}><Select value={fee.channel} onChange={(e) => setFee({ ...fee, channel: e.target.value as 'all' | 'b2b' | 'b2c' })}><option value="all">{t('pricing.anyChannel')}</option><option value="b2b">B2B</option><option value="b2c">B2C</option></Select></Field>
            <Checkbox checked={fee.taxable} onCheckedChange={(on) => setFee({ ...fee, taxable: on })} label={t('pricing.taxable')} />
            <Checkbox checked={fee.status === 'active'} onCheckedChange={(on) => setFee({ ...fee, status: on ? 'active' : 'inactive' })} label={t('pricing.active')} />
          </div>
        )}
      </Dialog>
    </div>
  );
}

function PromosTab() {
  const t = useTranslations();
  const format = useFormatter();
  const api = useApi();
  const promos = useQuery({ queryKey: ['pricing', 'promos'], queryFn: () => api.call('promoCodes.list') });
  const today = new Date().toISOString().slice(0, 10);
  const [editing, setEditing] = useState<PromoCodeInput | null>(null);
  const save = useAction((i: PromoCodeInput) => api.call('promoCodes.save', i), { success: t('pricing.saved'), invalidate: [['pricing']], onSuccess: () => setEditing(null) });
  const edit = (p: PromoCodeEntity) => setEditing({ id: p.id, code: p.code, mode: p.mode, value: p.value, serviceTypes: p.serviceTypes, validFrom: p.validFrom, validTo: p.validTo, maxUses: p.maxUses, status: p.status });
  return (
    <>
      <div className="mb-3 flex justify-end"><Can permission="pricing.discount"><Button onClick={() => setEditing({ code: '', mode: 'percent', value: 10, serviceTypes: [], validFrom: today, validTo: addDays(today, 90), maxUses: null, status: 'active' })}><Plus aria-hidden />{t('pricing.newPromo')}</Button></Can></div>
      {(promos.data ?? []).length === 0 ? <EmptyState title={t('pricing.tabPromos')} /> : (
        <Table data-testid="promos-table"><THead><tr><Th>{t('pricing.code')}</Th><Th numeric>{t('pricing.discountValue')}</Th><Th>{t('pricing.validTo')}</Th><Th numeric>{t('pricing.uses')}</Th><Th>{t('pricing.status')}</Th><Th /></tr></THead>
          <TBody>{(promos.data ?? []).map((p) => (
            <Tr key={p.id}><Td><code dir="ltr" className="font-semibold">{p.code}</code> {p.isDemoValue && <DemoBadge />}</Td><Td numeric>{p.mode === 'percent' ? `${p.value}%` : p.value}</Td>
              <Td>{format.dateTime(new Date(p.validTo), { dateStyle: 'medium' })}</Td><Td numeric>{p.uses}{p.maxUses ? ` / ${p.maxUses}` : ''}</Td>
              <Td><Badge tone={p.status === 'active' ? 'success' : 'neutral'} dot>{t(p.status === 'active' ? 'pricing.active' : 'pricing.inactive')}</Badge></Td>
              <Td><Can permission="pricing.discount"><Button size="sm" variant="ghost" onClick={() => edit(p)}><Pencil aria-hidden /></Button></Can></Td></Tr>
          ))}</TBody></Table>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={t('pricing.tabPromos')}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>{t('common.cancel')}</Button><Button loading={save.isPending} disabled={!/^[A-Za-z0-9-]{3,20}$/.test(editing?.code ?? '')} onClick={() => editing && save.mutate({ ...editing, code: editing.code.toUpperCase() })}>{t('common.save')}</Button></>}>
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('pricing.code')} required><Input dir="ltr" name="promoCode" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></Field>
            <Field label={t('pricing.discountValue')}><Input type="number" min={0} name="promoValue" value={editing.value} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} /></Field>
            <Field label={t('pricing.validFrom')}><DateInput value={editing.validFrom} onChange={(e) => setEditing({ ...editing, validFrom: e.target.value })} /></Field>
            <Field label={t('pricing.validTo')}><DateInput value={editing.validTo} onChange={(e) => setEditing({ ...editing, validTo: e.target.value })} /></Field>
            <Field label={t('pricing.maxUses')} optional><Input type="number" min={1} value={editing.maxUses ?? ''} placeholder={t('pricing.unlimited')} onChange={(e) => setEditing({ ...editing, maxUses: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label={t('pricing.mode')}><Select name="promoMode" value={editing.mode} onChange={(e) => setEditing({ ...editing, mode: e.target.value as 'percent' | 'fixed' })}><option value="percent">{t('enums.markupMode.percent')}</option><option value="fixed">{t('enums.markupMode.fixed')}</option></Select></Field>
            <Field label={t('pricing.status')}>
              <Select name="promoStatus" value={editing.status ?? 'active'} onChange={(e) => setEditing({ ...editing, status: e.target.value as 'active' | 'inactive' })}>
                <option value="active">{t('pricing.active')}</option><option value="inactive">{t('pricing.inactive')}</option>
              </Select>
            </Field>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** Pricing area (platform & agencies): rules, simulator, taxes & fees, promo codes, own defaults. */
export function PricingPage() {
  const t = useTranslations('pricing');
  const isPlatform = useSession((s) => s.session?.organization.type === 'platform');
  const canSimulate = useCan('pricing.simulate');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs defaultValue="rules">
        <TabsList>
          <Tab value="rules">{t('tabRules')}</Tab>
          {canSimulate && <Tab value="simulator" data-testid="tab-simulator">{t('tabSimulator')}</Tab>}
          <Tab value="taxes">{t('tabTaxes')}</Tab>
          <Tab value="promos">{t('tabPromos')}</Tab>
          {!isPlatform && <Tab value="defaults">{t('tabDefaults')}</Tab>}
        </TabsList>
        <TabsPanel value="rules"><RulesTab /></TabsPanel>
        {canSimulate && <TabsPanel value="simulator"><PricingSimulator /></TabsPanel>}
        <TabsPanel value="taxes"><TaxesFeesTab /></TabsPanel>
        <TabsPanel value="promos"><PromosTab /></TabsPanel>
        {!isPlatform && <TabsPanel value="defaults"><CommercialSettingsForm /></TabsPanel>}
      </Tabs>
    </>
  );
}
