import { PortalSection } from '@/features/portal/portal-section';

export default async function AgencySectionPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <PortalSection portal="agency" segments={slug} />;
}
