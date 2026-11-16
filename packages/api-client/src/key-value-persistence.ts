import type { PersistedState, PersistenceAdapter } from '@travelta/mock-server';

/** The subset of AsyncStorage the adapter needs (also satisfied by an in-memory map in tests). */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

/**
 * Snapshot persistence over a key-value store, chunked per collection so no single value grows past
 * per-row limits (Android AsyncStorage). Used by the mobile app (MOCK_DATA_ARCHITECTURE §3).
 */
export function createKeyValuePersistence(storage: KeyValueStorage, prefix = 'travelta:db'): PersistenceAdapter {
  const meta = `${prefix}:meta`;
  const chunk = (name: string) => `${prefix}:c:${name}`;
  return {
    async load() {
      const metaRaw = await storage.getItem(meta);
      if (!metaRaw) return null;
      try {
        const m = JSON.parse(metaRaw) as Omit<PersistedState['snapshot'], 'collections'> & { settings: PersistedState['settings']; names: string[] };
        const pairs = await storage.multiGet(m.names.map(chunk));
        const collections = Object.fromEntries(pairs.map(([key, value]) => [key.slice(chunk('').length), value ? JSON.parse(value) : []]));
        const { settings, names: _names, ...snapshot } = m;
        return { snapshot: { ...snapshot, collections }, settings };
      } catch (error) {
        console.warn('[persistence] stored demo data unreadable; reseeding', error);
        return null;
      }
    },
    async save({ snapshot, settings }) {
      const { collections, ...rest } = snapshot;
      const names = Object.keys(collections);
      // Remove chunks of collections that no longer exist, then write data before meta so a crash never leaves meta pointing at missing chunks.
      const stale = (await storage.getAllKeys()).filter((k) => k.startsWith(chunk('')) && !names.includes(k.slice(chunk('').length)));
      if (stale.length > 0) await storage.multiRemove(stale);
      await storage.multiSet(names.map((n): [string, string] => [chunk(n), JSON.stringify(collections[n])]));
      await storage.multiSet([[meta, JSON.stringify({ ...rest, settings, names })]]);
    },
    async clear() {
      await storage.multiRemove((await storage.getAllKeys()).filter((k) => k.startsWith(prefix)));
    },
  };
}
