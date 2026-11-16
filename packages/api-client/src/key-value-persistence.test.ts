import { MockServer, buildSeed } from '@travelta/mock-server';
import { describe, expect, it } from 'vitest';
import { createKeyValuePersistence, type KeyValueStorage } from './key-value-persistence';

function memoryStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    multiGet: async (keys) => keys.map((k) => [k, map.get(k) ?? null] as const),
    multiSet: async (pairs) => pairs.forEach(([k, v]) => map.set(k, v)),
    getAllKeys: async () => [...map.keys()],
    multiRemove: async (keys) => keys.forEach((k) => map.delete(k)),
  };
}

const NOW = Date.UTC(2026, 10, 15, 9);

describe('key-value persistence (mobile AsyncStorage adapter)', () => {
  it('round-trips a snapshot through per-collection chunks', async () => {
    const storage = memoryStorage();
    const adapter = createKeyValuePersistence(storage);
    const state = { snapshot: buildSeed({ now: NOW }), settings: { latency: { minMs: 1, maxMs: 2 }, failureRate: 0.1 } };
    await adapter.save(state);
    expect([...storage.map.keys()].filter((k) => k.includes(':c:'))).toHaveLength(Object.keys(state.snapshot.collections).length);
    expect(await adapter.load()).toEqual(state);
  });

  it('lets a mock server boot, persist and reload on the same storage', async () => {
    const storage = memoryStorage();
    const make = () => new MockServer({ persistence: createKeyValuePersistence(storage), realNow: () => NOW, persistDebounceMs: 0, simulation: { latency: { minMs: 0, maxMs: 0 } } });
    const first = make();
    await first.handle('demo.setClock', { offsetDays: 5 });
    await first.flush();
    const second = make();
    expect((await second.handle('demo.status', undefined)).clockOffsetDays).toBe(5);
  });

  it('returns null for corrupt data and clears only its own keys', async () => {
    const storage = memoryStorage();
    storage.map.set('travelta:db:meta', '{not json');
    storage.map.set('other-app', 'keep');
    const adapter = createKeyValuePersistence(storage);
    expect(await adapter.load()).toBeNull();
    await adapter.clear();
    expect([...storage.map.keys()]).toEqual(['other-app']);
  });
});
