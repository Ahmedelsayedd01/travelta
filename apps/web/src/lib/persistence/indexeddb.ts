import type { PersistedState, PersistenceAdapter } from '@travelta/api-client/mock';
import { createStore, del, get, set } from 'idb-keyval';

const KEY = 'travelta:db';

/**
 * Web persistence for the mock backend (MOCK_DATA_ARCHITECTURE §3): one IndexedDB record holding the snapshot.
 * IndexedDB can be unavailable (private mode, blocked storage); the app then keeps data in memory for the session.
 */
export function indexedDbPersistence(): PersistenceAdapter {
  const store = createStore('travelta-demo', 'state');
  return {
    async load() {
      try {
        return (await get<PersistedState>(KEY, store)) ?? null;
      } catch (error) {
        console.warn('[persistence] IndexedDB unavailable; using in-memory data', error);
        return null;
      }
    },
    async save(state) {
      try {
        await set(KEY, state, store);
      } catch (error) {
        console.warn('[persistence] save failed', error);
      }
    },
    async clear() {
      try {
        await del(KEY, store);
      } catch {
        /* nothing to clear */
      }
    },
  };
}
