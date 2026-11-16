'use client';

import { RequirePermission } from '@/components/portal/guards';
import { PortalHome } from '@/features/portal/portal-home';

export default function AdminHomePage() {
  return (
    <RequirePermission permission="platform.dashboard">
      <PortalHome />
    </RequirePermission>
  );
}
