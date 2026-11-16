'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CustomerInput } from '@travelta/schemas';
import { Check, UserPlus, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

export type CustomerChoice = { mode: 'existing'; customerId: string | null } | { mode: 'new'; customer: CustomerInput };

export const emptyCustomer = (): CustomerInput => ({ kind: 'individual', name: '', email: '', phone: '', nationalityIso2: null, customerType: 'individual', source: 'walk_in' });

/** W3 step 1: pick an existing customer of the agency or create one inline. */
export function CustomerStep({ value, onChange, errors }: { value: CustomerChoice; onChange: (v: CustomerChoice) => void; errors: Record<string, string> }) {
  const t = useTranslations('checkout');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const [q, setQ] = useState('');
  const customers = useQuery({ queryKey: ['customers', 'pick', q], queryFn: () => api.call('customers.list', { page: 1, pageSize: 8, q: q || undefined }), placeholderData: keepPreviousData });
  // A pre-selected customer (e.g. from a won CRM request) is always listed, even beyond the first page.
  const selectedId = value.mode === 'existing' ? value.customerId : null;
  const selected = useQuery({ queryKey: ['customers', 'one', selectedId], queryFn: () => api.call('customers.get', { id: selectedId! }), enabled: selectedId !== null });
  const rows = customers.data ? (selected.data && !customers.data.items.some((c) => c.id === selected.data.id) ? [selected.data, ...customers.data.items] : customers.data.items) : [];
  const countries = useQuery({ queryKey: ['reference', 'countries'], queryFn: () => api.call('reference.countries', undefined) });
  const tab = (mode: CustomerChoice['mode'], icon: React.ReactNode, label: string) => (
    <button type="button" role="tab" aria-selected={value.mode === mode} data-mode={mode}
      onClick={() => onChange(mode === 'new' ? { mode: 'new', customer: value.mode === 'new' ? value.customer : emptyCustomer() } : { mode: 'existing', customerId: null })}
      className={cn('flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium', value.mode === mode ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg')}>
      {icon}{label}
    </button>
  );
  const err = (f: string) => errors[`newCustomer.${f}`];

  return (
    <div className="flex flex-col gap-4" data-testid="customer-step">
      <div role="tablist" className="flex gap-1 rounded-lg bg-subtle p-1">
        {tab('existing', <Users className="size-4" aria-hidden />, t('existingCustomer'))}
        {tab('new', <UserPlus className="size-4" aria-hidden />, t('newCustomer'))}
      </div>
      {errors.customerId && <p role="alert" className="text-sm font-medium text-danger">{t.has('chooseCustomer') ? t('chooseCustomer') : ''}</p>}
      {value.mode === 'existing' ? (
        <>
          <Input type="search" placeholder={t('searchCustomers')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('searchCustomers')} name="customerSearch" />
          {!customers.data ? <Skeleton className="h-40 w-full" /> : rows.length === 0 ? <p className="text-sm text-fg-muted">{t('noCustomers')}</p> : (
            <ul className="flex flex-col gap-2" role="listbox" aria-label={t('chooseCustomer')}>
              {rows.map((c) => {
                const on = value.customerId === c.id;
                return (
                  <li key={c.id}>
                    <button type="button" role="option" aria-selected={on} onClick={() => onChange({ mode: 'existing', customerId: c.id })} data-testid="customer-option"
                      className={cn('flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-start', on ? 'border-primary bg-primary-soft/40 ring-1 ring-primary' : 'border-border hover:bg-subtle')}>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-on-primary-soft">{c.name.slice(0, 1)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-fg">{c.name}</span>
                        <span className="block truncate text-xs text-fg-muted" dir="ltr">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                      </span>
                      {on && <Check className="size-5 text-primary" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('customerName')} required error={err('name')}><Input name="customerName" value={value.customer.name} onChange={(e) => onChange({ mode: 'new', customer: { ...value.customer, name: e.target.value } })} /></Field>
          <Field label={t('customerKind')}>
            <Select value={value.customer.kind} onChange={(e) => onChange({ mode: 'new', customer: { ...value.customer, kind: e.target.value as 'individual' | 'corporate', customerType: e.target.value === 'corporate' ? 'corporate' : 'individual' } })}>
              <option value="individual">{t('individual')}</option><option value="corporate">{t('corporate')}</option>
            </Select>
          </Field>
          <Field label={t('phone')} error={err('phone')}><Input name="customerPhone" dir="ltr" value={value.customer.phone ?? ''} onChange={(e) => onChange({ mode: 'new', customer: { ...value.customer, phone: e.target.value } })} /></Field>
          <Field label={t('email')} error={err('email')}><Input name="customerEmail" type="email" dir="ltr" value={value.customer.email ?? ''} onChange={(e) => onChange({ mode: 'new', customer: { ...value.customer, email: e.target.value } })} /></Field>
          <Field label={t('nationality')} optional>
            <Select value={value.customer.nationalityIso2 ?? ''} onChange={(e) => onChange({ mode: 'new', customer: { ...value.customer, nationalityIso2: e.target.value || null } })}>
              <option value="">—</option>{countries.data?.map((c) => <option key={c.iso2} value={c.iso2}>{c.name[locale]}</option>)}
            </Select>
          </Field>
        </div>
      )}
    </div>
  );
}
