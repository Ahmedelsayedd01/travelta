'use client';

import { Suspense } from 'react';
import { StoreSearch } from '@/features/storefront/store-search';
import { StoreShell } from '@/features/storefront/store-shell';

export default function StoreSearchPage() {
  return (
    <StoreShell>
      <Suspense><StoreSearch /></Suspense>
    </StoreShell>
  );
}
