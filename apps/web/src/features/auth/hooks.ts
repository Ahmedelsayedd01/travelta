'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterCustomerInput, SessionDto } from '@travelta/schemas';
import { useApi } from '@/components/api-provider';
import { useSession } from '@/lib/session';

export const authKeys = { me: ['auth', 'me'] as const };

/** After any identity change, drop every cached query: data is tenant- and permission-specific. */
function useAdoptSession() {
  const qc = useQueryClient();
  const setSession = useSession((s) => s.setSession);
  return (session: SessionDto) => {
    qc.clear();
    setSession(session);
  };
}

export function useLogin() {
  const api = useApi();
  const adopt = useAdoptSession();
  return useMutation({ mutationFn: (input: LoginInput) => api.call('auth.login', input), onSuccess: adopt });
}

export function useRegisterCustomer() {
  const api = useApi();
  const adopt = useAdoptSession();
  return useMutation({ mutationFn: (input: RegisterCustomerInput) => api.call('auth.registerCustomer', input), onSuccess: adopt });
}

export function useSwitchOrg() {
  const api = useApi();
  const adopt = useAdoptSession();
  return useMutation({ mutationFn: (tenantId: string) => api.call('auth.switchOrg', { tenantId }), onSuccess: adopt });
}

export function useDemoLoginAs() {
  const api = useApi();
  const adopt = useAdoptSession();
  return useMutation({
    mutationFn: (input: { email: string; audience: 'staff' | 'customer' }) => api.call('demo.loginAs', input),
    onSuccess: adopt,
  });
}

/** Revoke server-side, then always clear locally (even if the token had already expired). */
export function useLogout() {
  const api = useApi();
  const qc = useQueryClient();
  const clear = useSession((s) => s.clear);
  return useMutation({
    mutationFn: () => api.call('auth.logout').catch(() => ({ ok: true as const })),
    onSettled: () => {
      clear();
      qc.clear();
    },
  });
}

/**
 * Re-validates the stored session against the backend (expiry, revocation, demo reset) and refreshes permissions.
 * Keyed by token, and a response only updates the store if its token is still current — otherwise an in-flight
 * check for a previous session could overwrite a newer one after a role or organization switch.
 */
export function useMe(enabled: boolean) {
  const api = useApi();
  const token = useSession((s) => s.token);
  return useQuery({
    queryKey: [...authKeys.me, token],
    queryFn: async () => {
      const me = await api.call('auth.me');
      if (useSession.getState().token === me.token) useSession.getState().setSession(me);
      return me;
    },
    enabled: enabled && token !== null,
    staleTime: 60_000,
  });
}

export function useDemoAccounts(enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: ['demo', 'accounts'], queryFn: () => api.call('demo.accounts'), enabled });
}
