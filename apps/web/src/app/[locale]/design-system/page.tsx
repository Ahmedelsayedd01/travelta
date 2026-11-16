import { redirect } from 'next/navigation';

/**
 * The design system now lives in Admin → Settings → Design system (decision 15 Nov 2026).
 * Old links are permanently forwarded there; the admin guard handles sign-in.
 */
export default async function DesignSystemRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/admin/settings?tab=design`);
}
