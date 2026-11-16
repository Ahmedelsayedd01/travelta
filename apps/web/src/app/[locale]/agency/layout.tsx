import type { ReactNode } from 'react';
import { MockApiGate } from '@/components/api-provider';
import { PortalGuard } from '@/components/portal/guards';

export default function AgencyLayout({ children }: { children: ReactNode }) {
  return (
    <MockApiGate>
      <PortalGuard portal="agency">{children}</PortalGuard>
    </MockApiGate>
  );
}
