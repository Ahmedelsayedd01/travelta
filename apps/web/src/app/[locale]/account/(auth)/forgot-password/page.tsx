import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MockApiGate } from '@/components/api-provider';
import { AuthCard } from '@/features/auth/auth-card';
import { PasswordRecovery } from '@/features/auth/password-recovery';
import { asLocale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'Reset password' };

/** Customer password recovery (Travelta Direct). */
export default async function CustomerForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(asLocale(locale));
  const t = await getTranslations('auth');
  return (
    <AuthCard title={t('forgotTitle')} subtitle={t('customerSubtitle')}>
      <MockApiGate><PasswordRecovery audience="customer" loginHref="/account/login" /></MockApiGate>
    </AuthCard>
  );
}
