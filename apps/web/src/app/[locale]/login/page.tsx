import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { MockApiGate } from '@/components/api-provider';
import { AuthCard } from '@/features/auth/auth-card';
import { LoginForm } from '@/features/auth/login-form';
import { RedirectIfSignedIn } from '@/features/auth/redirect-if-signed-in';
import { Link } from '@/i18n/navigation';
import { asLocale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'Business sign in' };

/** Business portal sign-in: platform staff, agencies, sub-agencies and suppliers. */
export default async function StaffLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(asLocale(locale));
  const t = await getTranslations('auth');
  const tHome = await getTranslations('home');
  return (
    <AuthCard audience="business" image="flight-wing"
      title={t('staffTitle')}
      subtitle={t('staffSubtitle')}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <Link href="/register/business" className="font-medium text-primary hover:underline">{tHome('becomePartner')}</Link>
          <Link href="/account/login" className="font-medium text-primary hover:underline">{t('customerLogin')}</Link>
        </div>
      }
    >
      <MockApiGate>
        <Suspense>
          <RedirectIfSignedIn audience="staff">
            <LoginForm audience="staff" />
          </RedirectIfSignedIn>
        </Suspense>
      </MockApiGate>
    </AuthCard>
  );
}
