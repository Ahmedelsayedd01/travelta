import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { MockApiGate } from '@/components/api-provider';
import { AuthCard } from '@/features/auth/auth-card';
import { LoginForm } from '@/features/auth/login-form';
import { RedirectIfSignedIn } from '@/features/auth/redirect-if-signed-in';
import { Link } from '@/i18n/navigation';
import { asLocale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'Sign in' };

/** Customer (B2C) sign-in for the Travelta Direct storefront. */
export default async function CustomerLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(asLocale(locale));
  const t = await getTranslations('auth');
  return (
    <AuthCard audience="customer" image="dest-luxor"
      title={t('customerTitle')}
      subtitle={t('customerSubtitle')}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <span>
            {t('noAccount')}{' '}
            <Link href="/account/register" className="font-medium text-primary hover:underline">{t('register')}</Link>
          </span>
          <Link href="/login" className="font-medium text-primary hover:underline">{t('businessLogin')}</Link>
        </div>
      }
    >
      <MockApiGate>
        <Suspense>
          <RedirectIfSignedIn audience="customer">
            <LoginForm audience="customer" />
          </RedirectIfSignedIn>
        </Suspense>
      </MockApiGate>
    </AuthCard>
  );
}
