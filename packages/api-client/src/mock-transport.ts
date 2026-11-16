import { MockServer, type PersistenceAdapter, type PersistedState, type ServerEvent, type SimulationSettings } from '@travelta/mock-server';
import type { OperationInput, OperationName, OperationOutput } from '@travelta/schemas';
import { createApiClient, type ApiClient } from './client';
import { toApiClientError } from './errors';
import type { CallOptions, Transport } from './transport';

export type { PersistenceAdapter, PersistedState, ServerEvent, SimulationSettings };
export { createKeyValuePersistence, type KeyValueStorage } from './key-value-persistence';

/** In-process transport to the simulated backend. All responses are already deep copies. */
export class MockTransport implements Transport {
  constructor(private readonly server: MockServer) {}

  async call<N extends OperationName>(name: N, input: OperationInput<N>, options?: CallOptions): Promise<OperationOutput<N>> {
    try {
      return await this.server.handle(name, input, options?.token);
    } catch (error) {
      throw toApiClientError(error);
    }
  }
}

export interface MockApi {
  api: ApiClient;
  /** Server events (data changed, clock moved) — apps use them to invalidate queries and notify other tabs. */
  subscribe(listener: (event: ServerEvent) => void): () => void;
  /** Boot: load persisted data or seed. */
  ready(): Promise<void>;
  /** Persist pending writes now (page hide / app background). */
  flush(): Promise<void>;
  /** Re-read persisted data written by another tab. */
  reload(): Promise<void>;
}

export interface CreateMockApiOptions {
  persistence: PersistenceAdapter;
  getToken?: () => string | null | undefined;
  onReseed?: (reason: string) => void;
  /** Dev builds validate every response against the contract. */
  validateOutput?: boolean;
}

/**
 * The single composition point for the prototype backend. Apps import this (never @travelta/mock-server),
 * so replacing it with an HTTP-backed client later is a one-file change per app.
 */
export function createMockApi({ persistence, getToken, onReseed, validateOutput }: CreateMockApiOptions): MockApi {
  const server = new MockServer({ persistence, onReseed, validateOutput });
  return {
    api: createApiClient({ transport: new MockTransport(server), getToken }),
    subscribe: (listener) => server.events.subscribe(listener),
    ready: () => server.ready(),
    flush: () => server.flush(),
    reload: () => server.reload(),
  };
}
