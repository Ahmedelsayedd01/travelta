import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@travelta/api-client';
import { useSession } from './session';

/**
 * An expired, revoked or reset session anywhere in the app signs the user out (guards then redirect to sign-in) —
 * but only when the rejected token is the CURRENT one. Requests still in flight from a session that was just
 * replaced (organization switch revokes the old token) must not sign the user out of the new session.
 */
function onError(error: unknown) {
  const current = useSession.getState().token;
  if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED' && current !== null && error.requestToken === current) {
    useSession.getState().clear();
  }
}

/** Retry only transient failures; business errors (4xx) are final. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => count < 2 && error instanceof ApiClientError && error.httpStatus >= 500,
      },
      mutations: { retry: false },
    },
  });
}
