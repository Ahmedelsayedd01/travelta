import type { Permission } from '@travelta/contracts';
import type { SessionDto } from '@travelta/schemas';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Client session (TENANCY_AND_SECURITY §7): token + the server's SessionDto.
 * PROTOTYPE ONLY — persisted in localStorage. Production uses an httpOnly cookie issued by the NestJS auth module.
 * Permissions here drive UX only (nav, guards, disabled buttons); every operation is re-authorised server-side.
 */
interface SessionState {
  token: string | null;
  session: SessionDto | null;
  setSession: (session: SessionDto) => void;
  clear: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      session: null,
      setSession: (session) => set({ token: session.token, session }),
      clear: () => set({ token: null, session: null }),
    }),
    { name: 'travelta:session', storage: createJSONStorage(() => localStorage) },
  ),
);

/** True once the persisted session has been read from storage (always false during SSR). */
export function useSessionHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useSession.persist.onFinishHydration(onChange),
    () => useSession.persist.hasHydrated(),
    () => false,
  );
}

export function usePermissions(): ReadonlySet<Permission> {
  const permissions = useSession((s) => s.session?.permissions);
  return new Set(permissions ?? []);
}

export function useCan(permission: Permission | undefined): boolean {
  const permissions = useSession((s) => s.session?.permissions);
  return permission === undefined || (permissions?.includes(permission) ?? false);
}
