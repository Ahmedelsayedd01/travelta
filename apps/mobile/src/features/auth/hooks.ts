import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterCustomerInput, SessionDto } from '@travelta/schemas';
import { useApi } from '@/lib/api-provider';
import { useSession } from '@/store/session';

/** The mobile app is the Travelta Direct customer app: every sign-in uses the `customer` audience. */
function useAdopt() {
  const qc = useQueryClient();
  const signIn = useSession((s) => s.signIn);
  return async (session: SessionDto) => {
    qc.clear();
    await signIn(session);
  };
}

export function useLogin() {
  const api = useApi();
  const adopt = useAdopt();
  return useMutation({
    mutationFn: (input: Omit<LoginInput, 'audience'>) => api.call('auth.login', { ...input, audience: 'customer' }),
    onSuccess: adopt,
  });
}

export function useRegister() {
  const api = useApi();
  const adopt = useAdopt();
  return useMutation({ mutationFn: (input: RegisterCustomerInput) => api.call('auth.registerCustomer', input), onSuccess: adopt });
}

export function useDemoCustomerLogin() {
  const api = useApi();
  const adopt = useAdopt();
  return useMutation({ mutationFn: () => api.call('demo.loginAs', { email: 'customer@example.com', audience: 'customer' }), onSuccess: adopt });
}

/** Revoke server-side (best effort), then always clear SecureStore and caches. */
export function useLogout() {
  const api = useApi();
  const qc = useQueryClient();
  const signOut = useSession((s) => s.signOut);
  return useMutation({
    mutationFn: () => api.call('auth.logout').catch(() => ({ ok: true as const })),
    onSettled: async () => {
      await signOut();
      qc.clear();
    },
  });
}
