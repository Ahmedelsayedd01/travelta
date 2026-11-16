import type { OperationInput, OperationName, OperationOutput } from '@travelta/schemas';
import { ApiClientError } from './errors';
import type { Transport } from './transport';

export interface ApiClientOptions {
  transport: Transport;
  /** Returns the current session token (Zustand store on web, SecureStore-backed store on mobile). */
  getToken?: () => string | null | undefined;
}

export interface ApiClient {
  call<N extends OperationName>(name: N, ...args: undefined extends OperationInput<N> ? [input?: OperationInput<N>] : [input: OperationInput<N>]): Promise<OperationOutput<N>>;
}

export function createApiClient({ transport, getToken }: ApiClientOptions): ApiClient {
  return {
    call: async (name, ...args) => {
      const token = getToken?.() ?? null;
      try {
        return await transport.call(name, args[0] as never, { token });
      } catch (error) {
        if (error instanceof ApiClientError) error.requestToken = token;
        throw error;
      }
    },
  };
}
