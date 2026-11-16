'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError } from '@travelta/api-client';
import { loginInputSchema, type LoginInput, type SessionDto } from '@travelta/schemas';
import { LogIn } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Checkbox } from '@/components/ui/checkbox';
import { rememberSession, setRememberSession } from '@/lib/session';
import { Link, useRouter } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/errors';
import { PORTAL_ROOT, safeNext } from '@/lib/nav';
import { useDemoAccounts, useDemoLoginAs, useLogin } from './hooks';

const demoTools = process.env.NEXT_PUBLIC_DEMO_TOOLS !== 'false';

export function useAfterLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('auth');
  return (session: SessionDto) => {
    toast.success(t('welcomeBack', { name: session.user.name.split(' ')[0] ?? session.user.name }));
    router.replace(safeNext(params.get('next'), session.portal) ?? PORTAL_ROOT[session.portal]);
  };
}

/** Sign-in for either audience: `staff` (agencies, suppliers, platform) or `customer` (storefront account). */
/** `storefront` signs a customer in to an agency-branded storefront (M22); `onDone` replaces the default redirect. */
export function LoginForm({ audience, storefront, storefrontOrg, onDone }: { audience: 'staff' | 'customer'; storefront?: string; storefrontOrg?: string; onDone?: () => void }) {
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();
  const login = useLogin();
  const defaultAfter = useAfterLogin();
  const afterLogin = onDone ?? defaultAfter;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema), defaultValues: { email: '', password: '', audience } });

  const [remember, setRemember] = useState(rememberSession);
  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    setRememberSession(remember);
    login.mutate(storefront ? { ...values, storefront } : values, {
      onSuccess: afterLogin,
      onError: (error) => {
        // An audience mismatch gets a specific hint instead of the generic "forbidden".
        if (error instanceof ApiClientError && error.code === 'FORBIDDEN') {
          setFormError(audience === 'customer' ? t('staffUseWeb') : t('customerUseStorefront'));
        } else if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED') {
          // Same message for unknown email and wrong password: never reveal which accounts exist.
          setFormError(t('invalidCredentials'));
        } else {
          setFormError(errorMessage(error));
        }
      },
    });
  });

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-describedby={formError ? 'login-error' : undefined}>
        <Field label={t('email')} required error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" dir="ltr" {...form.register('email')} />
        </Field>
        <Field label={t('password')} required error={form.formState.errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...form.register('password')} />
        </Field>
        <div className="-mt-1 flex flex-wrap items-center justify-between gap-2">
          <Checkbox label={t('keepSignedIn')} checked={remember} onCheckedChange={setRemember} />
          {!storefront && (
            <Link href={audience === 'customer' ? '/account/forgot-password' : '/forgot-password'} className="text-sm font-medium text-primary hover:underline" data-testid="forgot-link">
              {t('forgotPassword')}
            </Link>
          )}
        </div>
        {formError && (
          <p id="login-error" role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" loading={login.isPending}>
          <LogIn className="flip-rtl" aria-hidden />
          {t('signIn')}
        </Button>
      </form>
      {demoTools && <DemoQuickSignIn audience={audience} orgName={storefrontOrg} onDone={onDone} />}
    </div>
  );
}

/** Prototype helper: one-click sign-in as any demo account of this audience. */
function DemoQuickSignIn({ audience, orgName, onDone }: { audience: 'staff' | 'customer'; orgName?: string; onDone?: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const accounts = useDemoAccounts(true);
  const loginAs = useDemoLoginAs();
  const defaultAfter = useAfterLogin();
  const afterLogin = onDone ?? defaultAfter;
  const errorMessage = useErrorMessage();
  const list = (accounts.data ?? []).filter((a) => a.audience === audience && (!orgName || a.orgName.en === orgName) && (orgName || audience === 'staff' || a.orgName.en === 'Travelta Direct'));
  if (list.length === 0) return null;
  return (
    <section className="rounded-lg border border-dashed border-border-strong p-4" aria-label={t('auth.quickDemo')}>
      <p className="text-sm font-semibold text-fg">{t('auth.quickDemo')}</p>
      <p className="mb-3 text-xs text-fg-muted">{t('auth.demoHint')}</p>
      <ul className="flex flex-col gap-1">
        {list.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              disabled={loginAs.isPending}
              onClick={() => loginAs.mutate({ email: a.email, audience: a.audience }, { onSuccess: afterLogin, onError: (e) => toast.error(errorMessage(e)) })}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-start text-sm hover:bg-subtle disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-fg">{a.name}</span>
                <span className="block truncate text-xs text-fg-muted" dir="ltr">{a.email}</span>
              </span>
              <span className="shrink-0 text-end text-xs text-fg-muted">{a.orgName[locale]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
