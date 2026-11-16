import type { ReactNode } from 'react';
import { MockApiGate } from '@/components/api-provider';
import { PortalGuard } from '@/components/portal/guards';

export default function SupplierLayout({ children }: { children: ReactNode }) {
  return (
    <MockApiGate>
      <PortalGuard portal="supplier">{children}</PortalGuard>
    </MockApiGate>
  );
}
