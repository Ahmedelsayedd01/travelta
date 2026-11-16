import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError } from '@travelta/api-client';
import { registerCustomerInputSchema, type RegisterCustomerInput } from '@travelta/schemas';
import { Link, router, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useRegister } from './hooks';

/** Customer registration for Travelta Direct (the mobile app represents the Travelta brand — decision Q7). */
export function RegisterScreen() {
  const { t } = useTranslation();
  const { c, radii, rtl } = useTheme();
  const register = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setError } = useForm<RegisterCustomerInput>({
    resolver: zodResolver(registerCustomerInputSchema),
    defaultValues: { name: '', email: '', phone: undefined, password: '', locale: activeLocale },
    mode: 'onTouched',
  });

  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const submit = handleSubmit((values) => {
    setFormError(null);
    const mismatch = values.password !== confirm;
    setConfirmError(mismatch ? 'validation.passwords_mismatch' : null);
    setTermsError(!terms);
    if (mismatch || !terms) return;
    register.mutate(values, {
      onSuccess: () => router.replace('/'),
      onError: (error) => {
        if (error instanceof ApiClientError) {
          const fields = error.fieldErrors();
          for (const [field, issue] of Object.entries(fields)) setError(field as keyof RegisterCustomerInput, { message: issue });
          if (Object.keys(fields).length > 0) return;
          setFormError(t(`errors.${error.code}`));
        } else setFormError(t('errors.INTERNAL'));
      },
    });
  });

  return (
    <AuthLayout image="hotel-pool" title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
        <Controller control={control} name="name" render={({ field }) => (
          <TextField label={t('auth.name')} required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={formState.errors.name?.message} autoComplete="name" textContentType="name" />
        )} />
        <Controller control={control} name="email" render={({ field }) => (
          <TextField label={t('auth.email')} required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={formState.errors.email?.message}
            keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
        )} />
        <Controller control={control} name="phone" render={({ field }) => (
          <TextField label={`${t('auth.phone')} (${t('common.optional')})`} value={field.value ?? ''} onChangeText={(v) => field.onChange(v.trim() ? v : undefined)} onBlur={field.onBlur}
            error={formState.errors.phone?.message} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+20 100 123 4567" />
        )} />
        <Controller control={control} name="password" render={({ field }) => (
          <TextField label={t('auth.password')} required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={formState.errors.password?.message}
            help={t('auth.passwordHelp')} secureToggle autoComplete="new-password" textContentType="newPassword" testID="m-register-password" />
        )} />
        <TextField label={t('auth.confirmPassword')} required value={confirm} onChangeText={setConfirm} secureToggle autoComplete="new-password" textContentType="newPassword"
          error={confirmError ?? undefined} testID="m-register-confirm" />
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Pressable onPress={() => setTerms(!terms)} accessibilityRole="checkbox" accessibilityState={{ checked: terms }} testID="m-accept-terms"
          accessibilityLabel={`${t('auth.acceptTermsPlain')} ${t('auth.termsLink')}`}
          style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: termsError ? c.danger : terms ? c.primary : c['border-strong'], backgroundColor: terms ? c.primary : c.surface, alignItems: 'center', justifyContent: 'center' }}>
            {terms ? <Text size="xs" weight="bold" style={{ color: c['on-primary'] }}>✓</Text> : null}
          </View>
          <Text size="sm">{t('auth.acceptTermsPlain')}</Text>
        </Pressable>
        {/* Separate control: tapping the checkbox row never navigates away. */}
        <Pressable onPress={() => router.push('/terms' as Href)} accessibilityRole="link" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }} testID="m-terms-link">
          <Text size="sm" weight="semibold" tone="primary">{t('auth.termsLink')}</Text>
        </Pressable>
        </View>
        {termsError ? <Text size="xs" weight="medium" tone="danger">{t('auth.acceptTermsRequired')}</Text> : null}
        {formError ? (
          <View accessibilityRole="alert" style={{ backgroundColor: c['danger-bg'], borderRadius: radii.md, padding: 12 }}>
            <Text size="sm" weight="medium" tone="danger">{formError}</Text>
          </View>
        ) : null}
        <Button label={t('auth.register')} size="lg" loading={register.isPending} onPress={() => void submit()} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Text size="sm" tone="muted">{t('auth.haveAccount')}</Text>
          <Link href="/login" replace><Text size="sm" weight="semibold" tone="primary">{t('auth.signIn')}</Text></Link>
        </View>
    </AuthLayout>
  );
}
