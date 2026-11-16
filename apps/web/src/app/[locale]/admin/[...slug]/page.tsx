import { PortalSection } from '@/features/portal/portal-section';

export default async function AdminSectionPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <PortalSection portal="admin" segments={slug} />;
}
