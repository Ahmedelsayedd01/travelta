import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { MockApiGate } from '@/components/api-provider';
import { AuthCard } from '@/features/auth/auth-card';
import { RedirectIfSignedIn } from '@/features/auth/redirect-if-signed-in';
import { RegisterForm } from '@/features/auth/register-form';
import { Link } from '@/i18n/navigation';
import { asLocale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(asLocale(locale));
  const t = await getTranslations('auth');
  return (
    <AuthCard audience="customer" image="hotel-pool"
      title={t('registerTitle')}
      subtitle={t('registerSubtitle')}
      footer={
        <span>
          {t('haveAccount')}{' '}
          <Link href="/account/login" className="font-medium text-primary hover:underline">{t('signIn')}</Link>
        </span>
      }
    >
      <MockApiGate>
        <Suspense>
          <RedirectIfSignedIn audience="customer">
            <RegisterForm />
          </RedirectIfSignedIn>
        </Suspense>
      </MockApiGate>
    </AuthCard>
  );
}
