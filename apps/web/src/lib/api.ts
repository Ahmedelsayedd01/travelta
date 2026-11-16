import { createMockApi, type MockApi } from '@travelta/api-client/mock';
import { indexedDbPersistence } from './persistence/indexeddb';
import { useSession } from './session';

let instance: MockApi | null = null;
const reseedListeners = new Set<(reason: string) => void>();

/**
 * Browser-only singleton of the prototype backend. When the NestJS API exists this file is the
 * only place that changes: create an HTTP-backed client instead of the mock one.
 */
export function getMockApi(): MockApi {
  if (typeof window === 'undefined') throw new Error('The prototype backend runs in the browser only');
  instance ??= createMockApi({
    persistence: indexedDbPersistence(),
    getToken: () => useSession.getState().token,
    validateOutput: process.env.NODE_ENV !== 'production',
    onReseed: (reason) => reseedListeners.forEach((l) => l(reason)),
  });
  return instance;
}

export function onReseed(listener: (reason: string) => void): () => void {
  reseedListeners.add(listener);
  return () => reseedListeners.delete(listener);
}
