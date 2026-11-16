'use client';

import { use, Suspense } from 'react';
import { BrandedStorefront } from '@/features/storefront/branded';

/** Agency-branded storefront (M22). Subdomains and verified custom domains are rewritten here by the proxy (slug `_`). */
export default function BrandedStorefrontPage({ params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path } = use(params);
  return <Suspense><BrandedStorefront slug={slug} path={path ?? []} /></Suspense>;
}
