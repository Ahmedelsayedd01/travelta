import type { DemoSnapshot } from '@travelta/schemas';

export interface SimulationSettings {
  latency: { minMs: number; maxMs: number };
  /** Probability (0–1) that a non-demo operation fails with a simulated network error. */
  failureRate: number;
  /** One-shot override of the next live-API supplier response (MOCK_DATA_ARCHITECTURE §5). */
  nextSupplierResponse?: SupplierResponse;
}

export type SupplierResponse = 'auto' | 'confirm' | 'reject' | 'pending' | 'timeout';

/** What a device stores: the dataset plus that device's simulation preferences. */
export interface PersistedState {
  snapshot: DemoSnapshot;
  settings: SimulationSettings;
}

/**
 * Platform adapters live in the apps: IndexedDB on web, chunked AsyncStorage on mobile,
 * in-memory for tests. The mock server never touches a storage API directly.
 */
export interface PersistenceAdapter {
  load(): Promise<PersistedState | null>;
  save(state: PersistedState): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryPersistence implements PersistenceAdapter {
  private state: PersistedState | null = null;
  saves = 0;

  async load(): Promise<PersistedState | null> {
    return this.state ? structuredClone(this.state) : null;
  }

  async save(state: PersistedState): Promise<void> {
    this.saves++;
    this.state = structuredClone(state);
  }

  async clear(): Promise<void> {
    this.state = null;
  }
}
