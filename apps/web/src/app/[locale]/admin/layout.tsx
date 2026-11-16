import type { ReactNode } from 'react';
import { MockApiGate } from '@/components/api-provider';
import { PortalGuard } from '@/components/portal/guards';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <MockApiGate>
      <PortalGuard portal="admin">{children}</PortalGuard>
    </MockApiGate>
  );
}
