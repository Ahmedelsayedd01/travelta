import type { ReactNode } from 'react';
import { MockApiGate } from '@/components/api-provider';
import { PortalGuard } from '@/components/portal/guards';

/** Customer account area (sign-in and registration live in the sibling `(auth)` group, outside this guard). */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <MockApiGate>
      <PortalGuard portal="account">{children}</PortalGuard>
    </MockApiGate>
  );
}
