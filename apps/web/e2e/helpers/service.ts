import { createMockApi } from '@travelta/api-client/mock';
import type { OperationInput, OperationName, OperationOutput } from '@travelta/api-client';
import { DEMO_PASSWORD } from '../fixtures';

/**
 * Service-boundary harness: the same in-browser demo backend the apps use (`createMockApi`), run in Node with an
 * in-memory store. Calls go through the real operation contracts, auth and tenancy checks, with a real session
 * token per role — so authorisation is tested where it is enforced, not just by hiding navigation.
 */
export async function demoBackend() {
  let stored: unknown = null;
  let token: string | null = null;
  const mock = createMockApi({
    persistence: {
      load: async () => (stored ? structuredClone(stored) : null) as never,
      save: async (state) => { stored = structuredClone(state); },
      clear: async () => { stored = null; },
    },
    getToken: () => token,
  });
  await mock.ready();
  const call = <N extends OperationName>(op: N, ...input: OperationInput<N> extends undefined ? [] : [OperationInput<N>]) =>
    mock.api.call(op, ...(input as [never])) as Promise<OperationOutput<N>>;
  // No simulated latency or random failures: these tests check rules, not resilience.
  await call('demo.setSimulation', { latency: { minMs: 0, maxMs: 0 }, failureRate: 0 } as never).catch(() => undefined);

  /** Sign in as `email` (staff or customer); later calls carry that session's token. */
  async function signInAs(email: string, audience: 'staff' | 'customer' = 'staff', password = DEMO_PASSWORD) {
    token = null;
    const session = await call('auth.login', { email, password, audience } as never) as unknown as { token: string };
    token = session.token;
    return session;
  }
  /** Use an explicit token (e.g. one that was revoked). */
  const useToken = (t: string | null) => { token = t; };

  /** The error code a call fails with, or 'OK' when it succeeds. */
  async function outcome(fn: () => Promise<unknown>): Promise<string> {
    try { await fn(); return 'OK'; } catch (e) { return (e as { code?: string }).code ?? String(e); }
  }
  return { call, signInAs, useToken, outcome };
}
