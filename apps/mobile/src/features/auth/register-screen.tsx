import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError } from '@travelta/api-client';
import { registerCustomerInputSchema, type RegisterCustomerInput } from '@travelta/schemas';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useRegister } from './hooks';

/** Customer registration for Travelta Direct (the mobile app represents the Travelta brand — decision Q7). */
export function RegisterScreen() {
  const { t } = useTranslation();
  const { c, radii } = useTheme();
  const register = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setError } = useForm<RegisterCustomerInput>({
    resolver: zodResolver(registerCustomerInputSchema),
    defaultValues: { name: '', email: '', phone: undefined, password: '', locale: activeLocale },
    mode: 'onTouched',
  });

  const submit = handleSubmit((values) => {
    setFormError(null);
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text tone="muted">{t('auth.registerSubtitle')}</Text>
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
            help={t('auth.passwordHelp')} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        )} />
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
