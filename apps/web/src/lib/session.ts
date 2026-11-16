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

const REMEMBER_KEY = 'travelta:remember';
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

/** "Keep me signed in": on (default) = localStorage (survives restarts); off = sessionStorage (ends with the tab). */
export function setRememberSession(remember: boolean): void {
  safe(() => localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'), undefined);
}
export const rememberSession = (): boolean => safe(() => localStorage.getItem(REMEMBER_KEY) !== '0', true);

const sessionStorageChoice = {
  getItem: (name: string) => safe(() => localStorage.getItem(name) ?? sessionStorage.getItem(name), null),
  setItem: (name: string, value: string) => safe(() => {
    const keep = rememberSession();
    (keep ? localStorage : sessionStorage).setItem(name, value);
    (keep ? sessionStorage : localStorage).removeItem(name);
  }, undefined),
  removeItem: (name: string) => safe(() => { localStorage.removeItem(name); sessionStorage.removeItem(name); }, undefined),
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      session: null,
      setSession: (session) => set({ token: session.token, session }),
      clear: () => set({ token: null, session: null }),
    }),
    { name: 'travelta:session', storage: createJSONStorage(() => sessionStorageChoice) },
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
