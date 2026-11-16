import { ApiClientError } from '@travelta/api-client';
import { otpSchema, passwordSchema } from '@travelta/schemas';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {View } from 'react-native';
import { showAlert } from '@/lib/alert';
import { AuthLayout } from '@/components/auth/auth-layout';
import { OtpField } from '@/components/auth/otp-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useApi } from '@/lib/api-provider';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/store/session';

/** SIMULATION: the code would be emailed; the prototype shows it so the flow can be tested on a device. */
export function DemoCode({ code }: { code: string | null }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  if (!code) return null;
  return (
    <View accessibilityRole="alert" style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.highlight, backgroundColor: c['warning-bg'], borderRadius: 10, padding: 12, gap: 4 }} testID="m-demo-code">
      <Text size="sm">{t('auth.demoCodeNotice')}</Text>
      <Text size="xl" weight="bold" numeric style={{ letterSpacing: 4 }}>{code}</Text>
    </View>
  );
}

const RESEND_SECONDS = 60;

/** Seconds until "send a new code" is allowed again (client cooldown; the server code itself lasts 15 minutes). */
function useCooldown(): [number, () => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return [left, () => setLeft(RESEND_SECONDS)];
}

function StepBar({ step }: { step: number }) {
  const { t } = useTranslation();
  const { c, rtl } = useTheme();
  const labels = [t('auth.stepEmail'), t('auth.stepCode'), t('auth.stepPassword')];
  return (
    <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 8 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 3, now: step + 1 }} accessibilityLabel={t('auth.resetProgress')}>
      {labels.map((l, i) => (
        <View key={l} style={{ flex: 1, gap: 4 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= step ? c.primary : c.border }} />
          <Text size="xs" weight="medium" style={{ color: i <= step ? c.primary : c['fg-muted'] }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

/** Guided recovery: 1 email → 2 six-digit code → 3 new password → done (same auth.* operations as the web). */
export function ForgotScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const api = useApi();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [email, setEmail] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [expires, setExpires] = useState(15);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [cooldown, startCooldown] = useCooldown();
  const msg = (k: string) => (i18n.exists(k) ? t(k) : k);

  const request = async () => {
    setBusy(true); setErrors({});
    try {
      const out = await api.call('auth.requestPasswordReset', { email: email.trim(), audience: 'customer' });
      setDemoCode(out.demoCode); setExpires(out.expiresInMinutes); setCode(''); startCooldown(); setStep(1);
    } catch (e) {
      if (e instanceof ApiClientError && Object.keys(e.fieldErrors()).length) setErrors(e.fieldErrors());
      else showAlert(e instanceof ApiClientError ? t(`errors.${e.code}`) : t('errors.INTERNAL'));
    } finally { setBusy(false); }
  };
  const toPassword = () => {
    if (!otpSchema.safeParse(code).success) { setErrors({ code: t('auth.codeIncomplete') }); return; }
    setErrors({}); setStep(2);
  };
  const reset = async () => {
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) { setErrors({ password: msg(pw.error.issues[0]?.message ?? 'validation.weak_password') }); return; }
    if (password !== confirm) { setErrors({ confirm: msg('validation.passwords_mismatch') }); return; }
    setBusy(true); setErrors({});
    try {
      await api.call('auth.resetPassword', { email: email.trim(), audience: 'customer', code, password });
      setStep(3);
    } catch (e) {
      // Wrong / used / expired / locked code → back to the code step with the server's message.
      if (e instanceof ApiClientError && e.code === 'VALIDATION_ERROR') { setErrors({ code: msg(e.fieldErrors().code ?? 'validation.otp_invalid') }); setCode(''); setStep(1); }
      else showAlert(e instanceof ApiClientError ? t(`errors.${e.code}`) : t('errors.INTERNAL'));
    } finally { setBusy(false); }
  };

  return (
    <AuthLayout image="dest-aswan" title={t('auth.forgotTitle')} subtitle={step === 3 ? t('auth.resetDoneTitle') : t('auth.customerSubtitle')}>
      {step < 3 && <StepBar step={step} />}
      {step === 0 && (
        <>
          <Text tone="muted">{t('auth.forgotHelp')}</Text>
          <TextField label={t('auth.email')} required value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.email} testID="m-forgot-email" />
          <Button label={t('auth.sendCode')} size="lg" loading={busy} disabled={!email.includes('@')} onPress={() => void request()} testID="m-send-code" />
        </>
      )}
      {step === 1 && (
        <>
          <Text tone="muted" accessibilityLiveRegion="polite">{t('auth.codeSentTo', { email: email.trim() })}</Text>
          <DemoCode code={demoCode} />
          <OtpField value={code} onChange={(v) => { setCode(v); setErrors({}); }} label={t('auth.code')} error={errors.code} testID="m-reset-code" />
          {!errors.code && <Text size="xs" tone="muted">{t('auth.codeExpiry', { minutes: expires })}</Text>}
          <Button label={t('auth.continue')} size="lg" disabled={code.length !== 6} onPress={toPassword} testID="m-code-continue" />
          <Button label={cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendCode')} variant="ghost" disabled={cooldown > 0 || busy} onPress={() => void request()} testID="m-resend" />
        </>
      )}
      {step === 2 && (
        <>
          <TextField label={t('auth.newPassword')} required value={password} onChangeText={setPassword} secureToggle autoComplete="new-password" help={t('auth.passwordRules')} error={errors.password} testID="m-reset-password" />
          <TextField label={t('auth.confirmPassword')} required value={confirm} onChangeText={setConfirm} secureToggle autoComplete="new-password" error={errors.confirm} testID="m-reset-confirm" />
          <Button label={t('auth.resetPassword')} size="lg" loading={busy} onPress={() => void reset()} testID="m-reset-submit" />
          <Button label={t('auth.backToCode')} variant="ghost" onPress={() => setStep(1)} />
        </>
      )}
      {step === 3 && (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }} testID="m-reset-success" accessibilityLiveRegion="polite">
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c['success-bg'], alignItems: 'center', justifyContent: 'center' }}><Text size="2xl" tone="success">✓</Text></View>
          <Text size="xl" weight="bold">{t('auth.resetDoneTitle')}</Text>
          <Text tone="muted" style={{ textAlign: 'center' }}>{t('auth.resetDoneBody')}</Text>
          <View style={{ alignSelf: 'stretch' }}><Button label={t('auth.backToSignIn')} size="lg" onPress={() => router.replace('/login')} testID="m-back-to-login" /></View>
        </View>
      )}
    </AuthLayout>
  );
}

/** Profile card for unverified accounts: request a code and confirm it. */
export function VerifyEmailCard() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const api = useApi();
  const [demoCode, setDemoCode] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const session = useSession((s) => s.session);
  const signIn = useSession((s) => s.signIn);
  if (!session || session.user.emailVerified) return null;
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { showAlert(e instanceof ApiClientError ? (e.details?.[0]?.issue ? t(e.details[0].issue) : t(`errors.${e.code}`)) : t('errors.INTERNAL')); } finally { setBusy(false); } };
  return (
    <View style={{ backgroundColor: c['info-bg'], borderRadius: 12, padding: 14, gap: 10 }} testID="m-verify-card">
      <Text weight="semibold" style={{ color: c.info }}>{t('auth.verifyEmailPrompt', { email: session.user.email })}</Text>
      {demoCode === undefined ? (
        <Button label={t('auth.verifyNow')} variant="outline" loading={busy} onPress={() => void run(async () => setDemoCode((await api.call('auth.requestEmailVerification')).demoCode))} testID="m-verify-start" />
      ) : (
        <>
          <DemoCode code={demoCode} />
          <OtpField value={code} onChange={setCode} label={t('auth.code')} testID="m-verify-code" />
          <Button label={t('auth.verify')} loading={busy} disabled={code.length !== 6} onPress={() => void run(async () => { await signIn(await api.call('auth.verifyEmail', { code })); showAlert(t('auth.emailVerified')); })} testID="m-verify-submit" />
        </>
      )}
    </View>
  );
}
