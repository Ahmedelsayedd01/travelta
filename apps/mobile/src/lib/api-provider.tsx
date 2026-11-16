import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, type ApiClient } from '@travelta/api-client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { Skeleton } from '@/components/ui/feedback';
import { readToken } from '@/services/secure-session';
import { useSession } from '@/store/session';
import { useTheme } from './theme';
import { getMockApi } from './api';

const ApiContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}

/** Sign out only when the CURRENT token is rejected (not a request from a session that was already replaced). */
function onError(error: unknown) {
  const { token, signOut } = useSession.getState();
  if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED' && token !== null && error.requestToken === token) {
    void signOut();
  }
}

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: (n, e) => n < 2 && e instanceof ApiClientError && e.httpStatus >= 500 },
      mutations: { retry: false },
    },
  });
}

/**
 * Restores the session on launch: token from SecureStore → auth.me (fresh user/org/permissions).
 * An expired, revoked or reset session is removed from SecureStore and the user starts signed out.
 */
async function restoreSession(api: ApiClient): Promise<void> {
  const { signIn, signOut, markSignedOut } = useSession.getState();
  const token = await readToken();
  if (!token) {
    markSignedOut();
    return;
  }
  useSession.setState({ token });
  try {
    const me = await api.call('auth.me');
    if (me.user.userType !== 'customer') await signOut();
    else await signIn(me);
  } catch {
    await signOut();
  }
}

/** Invalidates queries on backend changes and flushes pending writes when the app goes to the background. */
function SyncBridge() {
  const qc = useQueryClient();
  useEffect(() => {
    const mock = getMockApi();
    const off = mock.subscribe((event) => {
      void qc.invalidateQueries();
      // A demo reset/import replaces every session: re-check ours.
      if (event.type === 'db.changed' && (event.operation === 'reset' || event.operation === 'import') && useSession.getState().token) {
        void restoreSession(mock.api);
      }
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void mock.flush();
    });
    return () => {
      off();
      sub.remove();
    };
  }, [qc]);
  return null;
}

/** Boots the device-local backend (load or seed) and restores the session before rendering the app. */
export function ApiProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const [ready, setReady] = useState(false);
  const { c } = useTheme();

  useEffect(() => {
    let active = true;
    const mock = getMockApi();
    void mock
      .ready()
      .then(() => restoreSession(mock.api))
      .then(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: c.canvas, padding: 24, gap: 12, justifyContent: 'center' }} accessibilityLabel="Loading">
        <Skeleton style={{ width: '60%', height: 24 }} />
        <Skeleton style={{ width: '90%' }} />
        <Skeleton style={{ width: '80%' }} />
      </View>
    );
  }
  return (
    <QueryClientProvider client={client}>
      <ApiContext.Provider value={getMockApi().api}>
        <SyncBridge />
        {children}
      </ApiContext.Provider>
    </QueryClientProvider>
  );
}
