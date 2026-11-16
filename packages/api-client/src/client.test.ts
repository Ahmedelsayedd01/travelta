import { MemoryPersistence, MockServer } from '@travelta/mock-server';
import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import { ApiClientError } from './errors';
import { MockTransport } from './mock-transport';

const api = () =>
  createApiClient({
    transport: new MockTransport(new MockServer({ persistence: new MemoryPersistence(), simulation: { latency: { minMs: 0, maxMs: 0 } }, persistDebounceMs: 0 })),
  });

describe('api client over the mock transport', () => {
  it('calls typed operations', async () => {
    const client = api();
    const currencies = await client.call('reference.currencies');
    expect(currencies.map((c) => c.code).sort()).toEqual(['EGP', 'EUR', 'SAR', 'USD']);
  });

  it('sends the current token and tags failures with the token they carried', async () => {
    const server = new MockServer({ persistence: new MemoryPersistence(), simulation: { latency: { minMs: 0, maxMs: 0 } }, persistDebounceMs: 0 });
    let token: string | null = null;
    const client = createApiClient({ transport: new MockTransport(server), getToken: () => token });
    const session = await client.call('auth.login', { email: 'owner@nilehorizon.demo', password: 'Demo@1234', audience: 'staff' });
    token = session.token;
    await expect(client.call('auth.me')).resolves.toMatchObject({ user: { email: 'owner@nilehorizon.demo' } });
    await client.call('auth.logout');
    const error = (await client.call('auth.me').catch((e: unknown) => e)) as ApiClientError;
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(error.requestToken).toBe(session.token);
  });

  it('turns server errors into ApiClientError with field errors', async () => {
    const client = api();
    const error = await client.call('demo.setClock', { offsetDays: 99_999 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe('VALIDATION_ERROR');
    expect((error as ApiClientError).httpStatus).toBe(422);
    expect(Object.keys((error as ApiClientError).fieldErrors())).toContain('offsetDays');
  });
});
