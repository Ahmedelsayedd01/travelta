import { ApiClientError } from '@travelta/api-client';
import { otpSchema, passwordSchema } from '@travelta/schemas';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
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

/** Forgot password → 6-digit code → new password (customer audience; same server rules as the web). */
export function ForgotScreen() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const api = useApi();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ demoCode: string | null } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => {
    if (e instanceof ApiClientError && Object.keys(e.fieldErrors()).length) setErrors(e.fieldErrors());
    else Alert.alert(e instanceof ApiClientError ? t(`errors.${e.code}`) : t('errors.INTERNAL'));
  };
  const request = async () => {
    setBusy(true); setErrors({});
    try { const out = await api.call('auth.requestPasswordReset', { email: email.trim(), audience: 'customer' }); setSent({ demoCode: out.demoCode }); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const reset = async () => {
    const e: Record<string, string> = {};
    if (!otpSchema.safeParse(code).success) e.code = 'validation.otp';
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) e.password = pw.error.issues[0]?.message ?? 'validation.weak_password';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.call('auth.resetPassword', { email: email.trim(), audience: 'customer', code, password });
      Alert.alert(t('auth.passwordChanged'));
      router.replace('/login');
    } catch (err) { fail(err); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        {!sent ? (
          <>
            <Text tone="muted">{t('auth.forgotHelp')}</Text>
            <TextField label={t('auth.email')} required value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.email} testID="m-forgot-email" />
            <Button label={t('auth.sendCode')} size="lg" loading={busy} disabled={!email.includes('@')} onPress={() => void request()} testID="m-send-code" />
          </>
        ) : (
          <>
            <Text tone="muted">{t('auth.codeSentTo', { email: email.trim() })}</Text>
            <DemoCode code={sent.demoCode} />
            <TextField label={t('auth.code')} required value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" error={errors.code} testID="m-reset-code" />
            <TextField label={t('auth.newPassword')} required value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" help={t('auth.passwordRules')} error={errors.password} testID="m-reset-password" />
            <Button label={t('auth.resetPassword')} size="lg" loading={busy} onPress={() => void reset()} testID="m-reset-submit" />
            <Button label={t('auth.resendCode')} variant="ghost" onPress={() => void request()} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { Alert.alert(e instanceof ApiClientError ? (e.details?.[0]?.issue ? t(e.details[0].issue) : t(`errors.${e.code}`)) : t('errors.INTERNAL')); } finally { setBusy(false); } };
  return (
    <View style={{ backgroundColor: c['info-bg'], borderRadius: 12, padding: 14, gap: 10 }} testID="m-verify-card">
      <Text weight="semibold" style={{ color: c.info }}>{t('auth.verifyEmailPrompt', { email: session.user.email })}</Text>
      {demoCode === undefined ? (
        <Button label={t('auth.verifyNow')} variant="outline" loading={busy} onPress={() => void run(async () => setDemoCode((await api.call('auth.requestEmailVerification')).demoCode))} testID="m-verify-start" />
      ) : (
        <>
          <DemoCode code={demoCode} />
          <TextField label={t('auth.code')} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" testID="m-verify-code" />
          <Button label={t('auth.verify')} loading={busy} disabled={code.length !== 6} onPress={() => void run(async () => { await signIn(await api.call('auth.verifyEmail', { code })); Alert.alert(t('auth.emailVerified')); })} testID="m-verify-submit" />
        </>
      )}
    </View>
  );
}
