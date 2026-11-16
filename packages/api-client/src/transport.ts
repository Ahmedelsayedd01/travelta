import type { OperationInput, OperationName, OperationOutput } from '@travelta/schemas';

/**
 * How the client reaches "the server". Today: MockTransport (in-process mock server).
 * Later: an HttpTransport that maps each operation to `operations[name].http` (method + path) on the NestJS API,
 * sends the session token as a bearer header and an Idempotency-Key where the contract asks for one.
 * Apps never depend on which transport is active.
 */
export interface Transport {
  call<N extends OperationName>(name: N, input: OperationInput<N>, options?: CallOptions): Promise<OperationOutput<N>>;
}

export interface CallOptions {
  /** Session token; resolved by the client from its token provider. */
  token?: string | null;
}
