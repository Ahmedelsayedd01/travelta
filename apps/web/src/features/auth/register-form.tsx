'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError } from '@travelta/api-client';
import { registerCustomerInputSchema, type RegisterCustomerInput } from '@travelta/schemas';
import { UserPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useErrorMessage } from '@/lib/errors';
import { useRegisterCustomer } from './hooks';
import { useAfterLogin } from './login-form';

/** B2C registration on the Travelta Direct storefront (agency storefronts pass their slug in Milestone 22). */
export function RegisterForm({ storefront, onDone }: { storefront?: string; onDone?: () => void } = {}) {
  const t = useTranslations('auth');
  const locale = useLocale() as 'en' | 'ar';
  const errorMessage = useErrorMessage();
  const register = useRegisterCustomer();
  const defaultAfter = useAfterLogin();
  const afterLogin = onDone ?? defaultAfter;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegisterCustomerInput>({
    resolver: zodResolver(registerCustomerInputSchema),
    defaultValues: { name: '', email: '', phone: undefined, password: '', locale },
    mode: 'onTouched',
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    register.mutate(
      { ...values, phone: values.phone?.trim() ? values.phone : undefined, ...(storefront ? { storefront } : {}) },
      {
        onSuccess: afterLogin,
        onError: (error) => {
          // Server-side field errors (e.g. email already registered) land on the field itself.
          if (error instanceof ApiClientError) {
            const fields = error.fieldErrors();
            for (const [field, issue] of Object.entries(fields)) form.setError(field as keyof RegisterCustomerInput, { message: issue });
            if (Object.keys(fields).length > 0) return;
          }
          setFormError(errorMessage(error));
        },
      },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label={t('name')} required error={form.formState.errors.name?.message}>
        <Input autoComplete="name" {...form.register('name')} />
      </Field>
      <Field label={t('email')} required error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" dir="ltr" {...form.register('email')} />
      </Field>
      <Field label={t('phone')} optional error={form.formState.errors.phone?.message}>
        <Input type="tel" autoComplete="tel" dir="ltr" placeholder="+20 100 123 4567" {...form.register('phone', { setValueAs: (v: string) => (v?.trim() ? v : undefined) })} />
      </Field>
      <Field label={t('password')} required error={form.formState.errors.password?.message} help={t('passwordHelp')}>
        <Input type="password" autoComplete="new-password" dir="ltr" {...form.register('password')} />
      </Field>
      {formError && (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" size="lg" loading={register.isPending}>
        <UserPlus aria-hidden />
        {t('register')}
      </Button>
    </form>
  );
}
