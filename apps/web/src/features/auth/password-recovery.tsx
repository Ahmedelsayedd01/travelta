'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError } from '@travelta/api-client';
import { otpSchema, passwordResetRequestSchema, passwordSchema, type PasswordResetRequest } from '@travelta/schemas';
import { ArrowLeft, CheckCircle2, KeyRound, MailCheck, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useApi } from '@/components/api-provider';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { OtpInput, Steps } from '@/components/ui/otp-input';
import { PasswordInput } from '@/components/ui/password-input';
import { Link } from '@/i18n/navigation';
import { applyFieldErrors, takeFieldErrors, useAction } from '@/lib/mutations';

const RESEND_SECONDS = 60;

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

/** Seconds left before "send a new code" is allowed again (client-side cooldown; the server code itself lasts 15 min). */
function useCountdown(): [number, () => void] {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until, now]);
  return [Math.max(0, Math.ceil((until - now) / 1000)), () => { const n = Date.now(); setNow(n); setUntil(n + RESEND_SECONDS * 1000); }];
}

/**
 * Guided recovery: 1 email → 2 six-digit code → 3 new password → done. Uses the existing auth.* operations only.
 * The server answers the same way whether or not the account exists, expires codes after 15 minutes and locks
 * them after five wrong attempts; an invalid or expired code sends the user back to step 2 with a clear message.
 */
export function PasswordRecovery({ audience, storefront, loginHref }: { audience: 'staff' | 'customer'; storefront?: string; loginHref: string }) {
  const t = useTranslations('auth');
  const tv = useTranslations();
  const api = useApi();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [email, setEmail] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState(15);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [cooldown, startCooldown] = useCountdown();
  const requestForm = useForm<PasswordResetRequest>({ resolver: zodResolver(passwordResetRequestSchema), defaultValues: { email: '', audience, storefront } });
  const msg = (k: string) => (tv.has(k as never) ? tv(k as never) : k);

  const request = useAction((input: PasswordResetRequest) => api.call('auth.requestPasswordReset', input), {
    onSuccess: (out, input) => { setEmail(input.email); setDemoCode(out.demoCode); setExpiresIn(out.expiresInMinutes); setCode(''); setCodeError(null); startCooldown(); setStep(1); },
  });
  const reset = useAction((input: { code: string; password: string }) => api.call('auth.resetPassword', { email, audience, storefront, ...input }), {
    onSuccess: () => setStep(3),
  });

  const toPassword = () => {
    if (!otpSchema.safeParse(code).success) { setCodeError(t('codeIncomplete')); return; }
    setCodeError(null);
    setStep(2);
  };
  const submitPassword = () => {
    const p = passwordSchema.safeParse(password);
    if (!p.success) { setPwError(msg(p.error.issues[0]?.message ?? 'validation.weak_password')); return; }
    if (password !== confirm) { setPwError(msg('validation.passwords_mismatch')); return; }
    setPwError(null);
    reset.mutate({ code, password }, {
      onError: (e) => {
        const f = takeFieldErrors(e);
        // Wrong, used, expired or locked code: back to the code step with the server's message.
        if (f?.code || (e instanceof ApiClientError && e.code === 'VALIDATION_ERROR')) { setCodeError(msg(f?.code ?? 'validation.otp_invalid')); setCode(''); setStep(1); }
        else if (f?.password) setPwError(msg(f.password));
      },
    });
  };

  const stepLabels = [t('stepEmail'), t('stepCode'), t('stepPassword')];
  if (step === 3) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status" data-testid="reset-success">
        <span className="flex size-14 items-center justify-center rounded-full bg-success-bg text-success"><CheckCircle2 className="size-7" aria-hidden /></span>
        <h2 className="text-xl font-semibold text-fg">{t('resetDoneTitle')}</h2>
        <p className="text-sm text-fg-muted">{t('resetDoneBody')}</p>
        <Link href={loginHref} className={buttonVariants({ size: 'lg', className: 'w-full' })} data-testid="back-to-login">{t('backToSignIn')}</Link>
      </div>
    );
  }
  return (
    <div>
      <Steps steps={stepLabels} current={step} label={t('resetProgress')} />
      {step === 0 && (
        <form noValidate className="flex flex-col gap-4" data-testid="forgot-form"
          onSubmit={requestForm.handleSubmit((v) => request.mutate(v, { onError: (e) => applyFieldErrors(e, requestForm.setError) }))}>
          <p className="text-sm text-fg-muted">{t('forgotHelp')}</p>
          <Field label={t('email')} required error={requestForm.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" dir="ltr" autoFocus {...requestForm.register('email')} />
          </Field>
          <Button type="submit" size="lg" loading={request.isPending}><MailCheck aria-hidden />{t('sendCode')}</Button>
          <Link href={loginHref} className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"><ArrowLeft className="flip-rtl size-4" aria-hidden />{t('backToSignIn')}</Link>
        </form>
      )}
      {step === 1 && (
        <form noValidate className="flex flex-col gap-4" data-testid="code-form" onSubmit={(e) => { e.preventDefault(); toPassword(); }}>
          <p className="text-sm text-fg-muted" role="status">{t('codeSentTo', { email })}</p>
          <DemoCodeNotice code={demoCode} />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg" id="otp-label">{t('code')}</span>
            <OtpInput value={code} onChange={(v) => { setCode(v); setCodeError(null); }} label={t('code')} invalid={Boolean(codeError)} describedBy={codeError ? 'otp-error' : 'otp-help'} autoFocus />
            {codeError ? <p id="otp-error" role="alert" className="text-sm text-danger">{codeError}</p>
              : <p id="otp-help" className="text-xs text-fg-muted">{t('codeExpiry', { minutes: expiresIn })}</p>}
          </div>
          <Button type="submit" size="lg" disabled={code.length !== 6} data-testid="code-continue">{t('continue')}</Button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setStep(0); setDemoCode(null); }}>{t('changeEmail')}</button>
            <Button type="button" variant="link" size="sm" disabled={cooldown > 0 || request.isPending} onClick={() => request.mutate({ email, audience, storefront })} data-testid="resend-code">
              <RotateCw aria-hidden />{cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resendCode')}
            </Button>
          </div>
        </form>
      )}
      {step === 2 && (
        <form noValidate className="flex flex-col gap-4" data-testid="reset-form" onSubmit={(e) => { e.preventDefault(); submitPassword(); }}>
          <Field label={t('newPassword')} required help={t('passwordRules')} error={pwError ?? undefined}>
            <PasswordInput name="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t('confirmPassword')} required>
            <PasswordInput name="confirmPassword" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" loading={reset.isPending}><KeyRound aria-hidden />{t('resetPassword')}</Button>
          <button type="button" className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline" onClick={() => setStep(1)}>
            <ArrowLeft className="flip-rtl size-4" aria-hidden />{t('backToCode')}
          </button>
        </form>
      )}
    </div>
  );
}
