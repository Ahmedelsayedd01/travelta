'use client';

import { MailWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { DemoCodeNotice } from './password-recovery';

/** Shown to signed-in users whose email is not verified yet; the code is (simulated) emailed on request. */
export function VerifyEmailBanner() {
  const t = useTranslations('auth');
  const api = useApi();
  const session = useSession((s) => s.session);
  const setSession = useSession((s) => s.setSession);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const request = useAction(() => api.call('auth.requestEmailVerification'), { onSuccess: (out) => { setDemoCode(out.demoCode); setOpen(true); } });
  const verify = useAction((c: string) => api.call('auth.verifyEmail', { code: c }), {
    success: t('emailVerified'), onSuccess: (s) => { setSession(s); setOpen(false); },
  });
  if (!session || session.user.emailVerified) return null;
  return (
    <>
      <div role="status" className="flex flex-wrap items-center gap-3 border-b border-border bg-info-bg px-4 py-2 text-sm text-info" data-testid="verify-email-banner">
        <MailWarning className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">{t('verifyEmailPrompt', { email: session.user.email })}</span>
        <Button size="sm" variant="outline" loading={request.isPending} onClick={() => request.mutate(undefined)} data-testid="verify-email-start">{t('verifyNow')}</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen} title={t('verifyEmailTitle')} description={t('codeSentTo', { email: session.user.email })}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>{t('later')}</Button>
          <Button loading={verify.isPending} disabled={!/^\d{6}$/.test(code)} onClick={() => verify.mutate(code)} data-testid="verify-email-submit">{t('verify')}</Button></>}>
        <div className="flex flex-col gap-4">
          <DemoCodeNotice code={demoCode} />
          <Field label={t('code')} required><Input name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
        </div>
      </Dialog>
    </>
  );
}
