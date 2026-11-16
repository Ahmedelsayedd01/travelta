import { PortalSection } from '@/features/portal/portal-section';

export default async function AccountSectionPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <PortalSection portal="account" segments={slug} />;
}
