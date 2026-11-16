import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { MockApiGate } from '@/components/api-provider';
import { AuthCard } from '@/features/auth/auth-card';
import { RedirectIfSignedIn } from '@/features/auth/redirect-if-signed-in';
import { BusinessSignupForm } from '@/features/onboarding/business-signup-form';
import { Link } from '@/i18n/navigation';
import { asLocale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'Register your company' };

/** Business onboarding, step 1 of 3 (W1). Steps 2–3 (documents, review) continue inside the portal's KYC area. */
export default async function BusinessRegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(asLocale(locale));
  const t = await getTranslations();
  return (
    <AuthCard audience="business" image="dest-cairo"
      wide
      title={t('onboarding.title')}
      subtitle={t('onboarding.subtitle')}
      footer={<span>{t('onboarding.haveAccount')} <Link href="/login" className="font-medium text-primary hover:underline">{t('auth.businessLogin')}</Link></span>}
    >
      <MockApiGate>
        <Suspense>
          <RedirectIfSignedIn audience="staff">
            <BusinessSignupForm />
          </RedirectIfSignedIn>
        </Suspense>
      </MockApiGate>
    </AuthCard>
  );
}
