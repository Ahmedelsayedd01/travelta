'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError } from '@travelta/api-client';
import { registerCustomerInputSchema } from '@travelta/schemas';
import { z } from 'zod';
import { UserPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Link } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/errors';
import { useRegisterCustomer } from './hooks';
import { useAfterLogin } from './login-form';

/** Client-only additions to the server contract: confirm password and terms acceptance (never sent). */
const registerFormSchema = registerCustomerInputSchema.extend({
  confirmPassword: z.string(),
  acceptTerms: z.literal(true, { error: 'validation.required' }),
}).refine((v) => v.password === v.confirmPassword, {
  error: 'validation.passwords_mismatch', path: ['confirmPassword'],
  // Report the mismatch together with other field errors, not only once everything else is valid.
  when: (p) => typeof (p.value as { password?: unknown }).password === 'string' && typeof (p.value as { confirmPassword?: unknown }).confirmPassword === 'string',
});
type RegisterValues = z.input<typeof registerFormSchema>;

/** B2C registration on the Travelta Direct storefront (agency storefronts pass their slug in Milestone 22). */
export function RegisterForm({ storefront, onDone }: { storefront?: string; onDone?: () => void } = {}) {
  const t = useTranslations('auth');
  const locale = useLocale() as 'en' | 'ar';
  const errorMessage = useErrorMessage();
  const register = useRegisterCustomer();
  const defaultAfter = useAfterLogin();
  const afterLogin = onDone ?? defaultAfter;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', phone: undefined, password: '', confirmPassword: '', acceptTerms: false as unknown as true, locale },
    mode: 'onTouched',
  });

  const onSubmit = form.handleSubmit((all) => {
    const { name, email, phone, password, locale: lang } = all; // confirmPassword / acceptTerms stay client-side
    const values = { name, email, phone, password, locale: lang };
    setFormError(null);
    register.mutate(
      { ...values, phone: values.phone?.trim() ? values.phone : undefined, ...(storefront ? { storefront } : {}) },
      {
        onSuccess: afterLogin,
        onError: (error) => {
          // Server-side field errors (e.g. email already registered) land on the field itself.
          if (error instanceof ApiClientError) {
            const fields = error.fieldErrors();
            for (const [field, issue] of Object.entries(fields)) form.setError(field as keyof RegisterValues, { message: issue });
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
        <PasswordInput autoComplete="new-password" {...form.register('password')} />
      </Field>
      <Field label={t('confirmPassword')} required error={form.formState.errors.confirmPassword?.message}>
        <PasswordInput autoComplete="new-password" {...form.register('confirmPassword')} />
      </Field>
      <div>
        <label className="flex items-start gap-2.5 text-sm text-fg">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--tv-primary)]" aria-invalid={form.formState.errors.acceptTerms ? true : undefined} {...form.register('acceptTerms')} data-testid="accept-terms" />
          <span>{t.rich('acceptTerms', { link: (chunks) => <Link href="/terms" target="_blank" className="font-medium text-primary underline-offset-2 hover:underline">{chunks}</Link> })}</span>
        </label>
        {form.formState.errors.acceptTerms && <p className="mt-1 text-sm text-danger" role="alert">{t('acceptTermsRequired')}</p>}
      </div>
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
