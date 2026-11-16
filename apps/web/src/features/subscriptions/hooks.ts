'use client';

import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/components/api-provider';
import { useSession } from '@/lib/session';

/** What the session's plan allows (SUB-2/3): modules, storefront and whether data is writable. */
export function useSubscriptionAccess() {
  const api = useApi();
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ['subscriptions', 'access', token], queryFn: () => api.call('subscriptions.access', undefined), enabled: token !== null, staleTime: 30_000 });
}
