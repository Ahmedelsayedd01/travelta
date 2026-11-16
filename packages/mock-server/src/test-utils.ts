import { MemoryPersistence } from './db/persistence';
import { MockServer } from './server';

/** Fixed "real" time for deterministic tests: 15 Nov 2026 09:00 UTC. */
export const FIXED_NOW = Date.UTC(2026, 10, 15, 9, 0, 0);

export function testServer(overrides: { persistence?: MemoryPersistence; realNow?: () => number; history?: boolean } = {}) {
  const persistence = overrides.persistence ?? new MemoryPersistence();
  const server = new MockServer({
    persistence,
    realNow: overrides.realNow ?? (() => FIXED_NOW),
    simulation: { latency: { minMs: 0, maxMs: 0 }, failureRate: 0 },
    persistDebounceMs: 0,
    validateOutput: true,
    history: overrides.history ?? false,
  });
  return { server, persistence };
}
