'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { SERVICE_TYPES, type ServiceType } from '@travelta/contracts';
import { registerBusinessInputSchema, type RegisterBusinessInput } from '@travelta/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Truck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { SERVICE_ICONS } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Stepper } from '@/components/ui/stepper';
import { useRouter } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/errors';
import { applyFieldErrors } from '@/lib/mutations';
import { PORTAL_ROOT } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

/** Onboarding step 1 (W1): company + owner account. Creates a `pending_kyc` organization and continues to documents. */
export function BusinessSignupForm() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const setSession = useSession((s) => s.setSession);
  const [pending, setPending] = useState(false);
  const countries = useQuery({ queryKey: ['reference', 'countries'], queryFn: () => api.call('reference.countries') });
  const form = useForm<RegisterBusinessInput>({
    resolver: zodResolver(registerBusinessInputSchema) as Resolver<RegisterBusinessInput>,
    defaultValues: {
      orgType: 'agency', serviceTypes: [], acceptTerms: false as unknown as true,
      company: { name: { en: '', ar: '' }, legalName: '', countryIso2: 'EG', city: '', contactEmail: '', contactPhone: '' },
      owner: { name: '', email: '', password: '' },
    },
    mode: 'onTouched',
  });
  const orgType = form.watch('orgType');
  const services = new Set(form.watch('serviceTypes'));
  const e = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    setPending(true);
    try {
      const session = await api.call('onboarding.registerBusiness', values);
      qc.clear();
      setSession(session);
      toast.success(t('onboarding.welcome'));
      router.replace(`${PORTAL_ROOT[session.portal]}/kyc?onboarding=1`);
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  });

  const typeOption = (value: 'agency' | 'supplier', Icon: typeof Briefcase, title: string, hint: string) => (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors', orgType === value ? 'border-primary bg-primary-soft' : 'border-border hover:bg-subtle')}>
      <input type="radio" value={value} className="sr-only" {...form.register('orgType')} />
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', orgType === value ? 'bg-primary text-on-primary' : 'bg-subtle text-fg-muted')}><Icon className="size-5" aria-hidden /></span>
      <span><span className="block font-semibold text-fg">{title}</span><span className="block text-sm text-fg-muted">{hint}</span></span>
    </label>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8" data-testid="business-signup">
      <Stepper steps={[t('onboarding.step1'), t('onboarding.step2'), t('onboarding.step3')]} current={0} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold text-fg">{t('onboarding.iAm')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {typeOption('agency', Briefcase, t('onboarding.agency'), t('onboarding.agencyHint'))}
          {typeOption('supplier', Truck, t('onboarding.supplier'), t('onboarding.supplierHint'))}
        </div>
      </fieldset>

      {orgType === 'supplier' && (
        <fieldset>
          <legend className="text-sm font-semibold text-fg">{t('onboarding.servicesToSell')} <span className="text-danger">*</span></legend>
          <p className="mb-3 text-xs text-fg-muted">{t('onboarding.servicesHint')}</p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_TYPES.map((s: ServiceType) => {
              const Icon = SERVICE_ICONS[s];
              const on = services.has(s);
              return (
                <button key={s} type="button" aria-pressed={on}
                  onClick={() => form.setValue('serviceTypes', on ? [...services].filter((x) => x !== s) : [...services, s], { shouldValidate: form.formState.isSubmitted })}
                  className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors', on ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-fg hover:bg-subtle')}>
                  <Icon className="size-4" aria-hidden />{t(`enums.serviceType.${s}`)}
                </button>
              );
            })}
          </div>
          {e.serviceTypes && <p role="alert" className="mt-2 text-xs font-medium text-danger">{t('validation.required')}</p>}
        </fieldset>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-fg">{t('onboarding.company')}</legend>
        <Field label={t('settings.nameEn')} required error={e.company?.name?.en?.message}><Input {...form.register('company.name.en')} /></Field>
        <Field label={t('settings.nameAr')} required error={e.company?.name?.ar?.message}><Input dir="rtl" {...form.register('company.name.ar')} /></Field>
        <Field className="sm:col-span-2" label={t('settings.legalName')} required error={e.company?.legalName?.message}><Input {...form.register('company.legalName')} /></Field>
        <Field label={t('onboarding.country')} required>
          {/* Rendered once options exist so the default (EG) is applied to the native select. */}
          {countries.data ? (
            <Select {...form.register('company.countryIso2')}>
              {countries.data.map((c) => <option key={c.iso2} value={c.iso2}>{c.name[locale]}</option>)}
            </Select>
          ) : <Input disabled aria-busy="true" />}
        </Field>
        <Field label={t('settings.city')} required error={e.company?.city?.message}><Input {...form.register('company.city')} /></Field>
        <Field label={t('settings.contactEmail')} required error={e.company?.contactEmail?.message}><Input type="email" dir="ltr" {...form.register('company.contactEmail')} /></Field>
        <Field label={t('settings.contactPhone')} required error={e.company?.contactPhone?.message}><Input type="tel" dir="ltr" placeholder="+20 2 2555 0100" {...form.register('company.contactPhone')} /></Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-fg">{t('onboarding.owner')}</legend>
        <Field label={t('auth.name')} required error={e.owner?.name?.message}><Input autoComplete="name" {...form.register('owner.name')} /></Field>
        <Field label={t('auth.email')} required error={e.owner?.email?.message}><Input type="email" autoComplete="email" dir="ltr" {...form.register('owner.email')} /></Field>
        <Field className="sm:col-span-2" label={t('auth.password')} required help={t('auth.passwordHelp')} error={e.owner?.password?.message}>
          <Input type="password" autoComplete="new-password" dir="ltr" {...form.register('owner.password')} />
        </Field>
      </fieldset>

      <div>
        <Checkbox checked={form.watch('acceptTerms') === true} onCheckedChange={(on) => form.setValue('acceptTerms', on as true, { shouldValidate: form.formState.isSubmitted })} label={t('onboarding.acceptTerms')} />
        {e.acceptTerms && <p role="alert" className="mt-1 text-xs font-medium text-danger">{t('validation.accept_terms')}</p>}
      </div>

      <Button type="submit" size="lg" loading={pending}>{t('onboarding.continue')}</Button>
    </form>
  );
}
