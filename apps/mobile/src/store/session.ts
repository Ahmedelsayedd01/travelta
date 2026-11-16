import type { SessionDto } from '@travelta/schemas';
import { create } from 'zustand';
import { deleteToken, writeToken } from '@/services/secure-session';

/**
 * Mobile session state. `restoring` until the token from SecureStore has been checked with the backend.
 * Permissions are UX-only here; the (mock) server re-authorises every operation.
 */
interface SessionState {
  status: 'restoring' | 'signedOut' | 'signedIn';
  token: string | null;
  session: SessionDto | null;
  /** Adopt a session issued by login/register/me and keep its token in SecureStore. */
  signIn: (session: SessionDto) => Promise<void>;
  /** Forget the session locally and in SecureStore. */
  signOut: () => Promise<void>;
  markSignedOut: () => void;
}

export const useSession = create<SessionState>()((set) => ({
  status: 'restoring',
  token: null,
  session: null,
  signIn: async (session) => {
    await writeToken(session.token);
    set({ status: 'signedIn', token: session.token, session });
  },
  signOut: async () => {
    await deleteToken();
    set({ status: 'signedOut', token: null, session: null });
  },
  markSignedOut: () => set({ status: 'signedOut', token: null, session: null }),
}));
