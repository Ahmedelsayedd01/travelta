import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MockApiGate } from '@/components/api-provider';
import { AuthCard } from '@/features/auth/auth-card';
import { PasswordRecovery } from '@/features/auth/password-recovery';
import { asLocale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'Reset password' };

/** Business (agency, supplier, platform) password recovery. */
export default async function StaffForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(asLocale(locale));
  const t = await getTranslations('auth');
  return (
    <AuthCard title={t('forgotTitle')} subtitle={t('staffSubtitle')}>
      <MockApiGate><PasswordRecovery audience="staff" loginHref="/login" /></MockApiGate>
    </AuthCard>
  );
}
