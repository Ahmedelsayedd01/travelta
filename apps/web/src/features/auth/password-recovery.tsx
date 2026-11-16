'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { passwordResetRequestSchema, passwordResetSchema, type PasswordResetInput, type PasswordResetRequest } from '@travelta/schemas';
import { KeyRound, MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import { applyFieldErrors, useAction } from '@/lib/mutations';

/** SIMULATION banner: the code would be emailed; the prototype shows it so the flow is usable without a mailbox. */
export function DemoCodeNotice({ code }: { code: string | null }) {
  const t = useTranslations('auth');
  if (!code) return null;
  return (
    <p role="status" className="rounded-md border border-dashed border-highlight bg-warning-bg px-3 py-2 text-sm text-fg" data-testid="demo-code">
      {t('demoCodeNotice')} <strong className="tabular font-mono text-base tracking-widest" dir="ltr">{code}</strong>
    </p>
  );
}

/**
 * Forgot password → one-time code → new password. Same answer whether or not the account exists; the code expires
 * after 15 minutes and locks after five wrong attempts (server-side).
 */
export function PasswordRecovery({ audience, storefront, loginHref }: { audience: 'staff' | 'customer'; storefront?: string; loginHref: string }) {
  const t = useTranslations('auth');
  const api = useApi();
  const router = useRouter();
  const [step, setStep] = useState<{ email: string; demoCode: string | null } | null>(null);
  const requestForm = useForm<PasswordResetRequest>({ resolver: zodResolver(passwordResetRequestSchema), defaultValues: { email: '', audience, storefront } });
  const resetForm = useForm<PasswordResetInput>({ resolver: zodResolver(passwordResetSchema), defaultValues: { email: '', audience, storefront, code: '', password: '' } });
  const request = useAction((input: PasswordResetRequest) => api.call('auth.requestPasswordReset', input), {
    onSuccess: (out, input) => { setStep({ email: input.email, demoCode: out.demoCode }); resetForm.reset({ email: input.email, audience, storefront, code: '', password: '' }); },
  });
  const reset = useAction((input: PasswordResetInput) => api.call('auth.resetPassword', input), {
    success: t('passwordChanged'), onSuccess: () => router.replace(loginHref),
  });

  if (!step) {
    return (
      <form noValidate className="flex flex-col gap-4" data-testid="forgot-form"
        onSubmit={requestForm.handleSubmit((v) => request.mutate(v, { onError: (e) => applyFieldErrors(e, requestForm.setError) }))}>
        <p className="text-sm text-fg-muted">{t('forgotHelp')}</p>
        <Field label={t('email')} required error={requestForm.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" dir="ltr" {...requestForm.register('email')} />
        </Field>
        <Button type="submit" size="lg" loading={request.isPending}><MailCheck aria-hidden />{t('sendCode')}</Button>
        <Link href={loginHref} className="text-center text-sm font-medium text-primary hover:underline">{t('backToSignIn')}</Link>
      </form>
    );
  }
  return (
    <form noValidate className="flex flex-col gap-4" data-testid="reset-form"
      onSubmit={resetForm.handleSubmit((v) => reset.mutate(v, { onError: (e) => applyFieldErrors(e, resetForm.setError) }))}>
      <p className="text-sm text-fg-muted" role="status">{t('codeSentTo', { email: step.email })}</p>
      <DemoCodeNotice code={step.demoCode} />
      <Field label={t('code')} required error={resetForm.formState.errors.code?.message}>
        <Input inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} {...resetForm.register('code')} />
      </Field>
      <Field label={t('newPassword')} required error={resetForm.formState.errors.password?.message} help={t('passwordRules')}>
        <Input type="password" autoComplete="new-password" dir="ltr" {...resetForm.register('password')} />
      </Field>
      <Button type="submit" size="lg" loading={reset.isPending}><KeyRound aria-hidden />{t('resetPassword')}</Button>
      <Button type="button" variant="link" onClick={() => request.mutate({ email: step.email, audience, storefront }, { onSuccess: () => toast.success(t('codeResent')) })}>{t('resendCode')}</Button>
    </form>
  );
}
