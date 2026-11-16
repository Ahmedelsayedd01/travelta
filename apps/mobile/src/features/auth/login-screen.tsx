import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError } from '@travelta/api-client';
import { loginInputSchema, type z } from '@travelta/schemas';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/lib/theme';
import { useDemoCustomerLogin, useLogin } from './hooks';

const schema = loginInputSchema.omit({ audience: true, storefront: true });
type Values = z.input<typeof schema>;

export function LoginScreen() {
  const { t } = useTranslation();
  const { c, radii } = useTheme();
  const login = useLogin();
  const demo = useDemoCustomerLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onError = (error: unknown) => {
    if (error instanceof ApiClientError && error.code === 'FORBIDDEN') setFormError(t('auth.staffUseWeb'));
    else if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED') setFormError(t('auth.invalidCredentials'));
    else setFormError(error instanceof ApiClientError ? t(`errors.${error.code}`) : t('errors.INTERNAL'));
  };
  const done = () => router.replace('/');

  return (
    <AuthLayout image="dest-luxor" title={t('auth.customerTitle')} subtitle={t('auth.customerSubtitle')}>
        <Controller control={control} name="email" render={({ field }) => (
          <TextField label={t('auth.email')} required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
            error={formState.errors.email?.message} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
        )} />
        <Controller control={control} name="password" render={({ field }) => (
          <TextField label={t('auth.password')} required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
            error={formState.errors.password?.message} secureToggle autoComplete="current-password" textContentType="password" testID="m-login-password" />
        )} />
        <Link href="/forgot-password" style={{ alignSelf: 'flex-end' }} testID="m-forgot-link"><Text size="sm" weight="semibold" tone="primary">{t('auth.forgotPassword')}</Text></Link>
        {formError ? (
          <View accessibilityRole="alert" style={{ backgroundColor: c['danger-bg'], borderRadius: radii.md, padding: 12 }}>
            <Text size="sm" weight="medium" tone="danger">{formError}</Text>
          </View>
        ) : null}
        <Button
          label={t('auth.signIn')}
          size="lg"
          loading={login.isPending}
          onPress={() => void handleSubmit((values) => { setFormError(null); login.mutate(values, { onSuccess: done, onError }); })()}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Text size="sm" tone="muted">{t('auth.noAccount')}</Text>
          <Link href="/register" replace><Text size="sm" weight="semibold" tone="primary">{t('auth.register')}</Text></Link>
        </View>
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c['border-strong'], borderRadius: radii.lg, padding: 12, gap: 8 }}>
          <Text size="sm" weight="semibold">{t('auth.quickDemo')}</Text>
          <Text size="xs" tone="muted">{t('auth.demoHint')}</Text>
          <Button label="Sara Ali · customer@example.com" variant="outline" loading={demo.isPending} onPress={() => demo.mutate(undefined, { onSuccess: done, onError })} />
        </View>
    </AuthLayout>
  );
}
