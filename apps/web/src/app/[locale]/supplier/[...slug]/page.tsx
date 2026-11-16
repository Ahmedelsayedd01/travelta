import { PortalSection } from '@/features/portal/portal-section';

export default async function SupplierSectionPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <PortalSection portal="supplier" segments={slug} />;
}
