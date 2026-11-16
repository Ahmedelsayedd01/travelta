import { createId, createRng, type Rng } from '@travelta/shared';

/** Shared helpers for deterministic seed builders. */
export interface SeedContext {
  rng: Rng;
  /** Seed reference instant (ms). Seeded history is generated relative to it. */
  now: number;
  nowIso: string;
  today: string;
  id: <P extends string>(prefix: P) => `${P}_${string}`;
  stamp: () => { createdAt: string; updatedAt: string; version: number };
}

export function createSeedContext(seed: number, now: number): SeedContext {
  const rng = createRng(seed);
  const nowIso = new Date(now).toISOString();
  let tick = 0;
  return {
    rng,
    now,
    nowIso,
    today: nowIso.slice(0, 10),
    // Ids embed a monotonically increasing time so they keep insertion order and stay deterministic.
    id: (prefix) => createId(prefix, now - 10_000_000 + tick++, rng.next),
    stamp: () => ({ createdAt: nowIso, updatedAt: nowIso, version: 1 }),
  };
}
