import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './seed/identity';
import { testServer } from './test-utils';

const NEW_PASSWORD = 'Sunrise#2027';

describe('password reset and email verification (simulated email)', () => {
  it('resets a customer password with a one-time code and revokes existing sessions', async () => {
    const { server } = testServer();
    const old = await server.handle('auth.login', { email: 'customer@example.com', password: DEMO_PASSWORD, audience: 'customer' });
    const sent = await server.handle('auth.requestPasswordReset', { email: 'customer@example.com', audience: 'customer' });
    expect(sent.demoCode).toMatch(/^\d{6}$/);
    await server.handle('auth.resetPassword', { email: 'customer@example.com', audience: 'customer', code: sent.demoCode!, password: NEW_PASSWORD });
    await expect(server.handle('auth.me', undefined, old.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(server.handle('auth.login', { email: 'customer@example.com', password: DEMO_PASSWORD, audience: 'customer' })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(server.handle('auth.login', { email: 'customer@example.com', password: NEW_PASSWORD, audience: 'customer' })).resolves.toMatchObject({ portal: 'account' });
    // The code is single-use.
    await expect(server.handle('auth.resetPassword', { email: 'customer@example.com', audience: 'customer', code: sent.demoCode!, password: 'Another#2027' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // The email went through the outbox.
    const admin = await server.handle('auth.login', { email: 'admin@travelta.demo', password: DEMO_PASSWORD, audience: 'staff' });
    const outbox = await server.handle('outbox.list', { page: 1, pageSize: 50 }, admin.token);
    expect(outbox.items.some((m) => m.topic === 'auth.password_reset' && m.toAddress === 'customer@example.com')).toBe(true);
  });

  it('does not reveal whether an account exists and locks a code after five wrong guesses', async () => {
    const { server } = testServer();
    const unknown = await server.handle('auth.requestPasswordReset', { email: 'nobody@example.com', audience: 'customer' });
    expect(unknown).toMatchObject({ sent: true, demoCode: null });
    const sent = await server.handle('auth.requestPasswordReset', { email: 'owner@nilehorizon.demo', audience: 'staff' });
    const wrong = sent.demoCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(server.handle('auth.resetPassword', { email: 'owner@nilehorizon.demo', audience: 'staff', code: wrong, password: NEW_PASSWORD })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    // Even the right code no longer works once the attempts are used up.
    await expect(server.handle('auth.resetPassword', { email: 'owner@nilehorizon.demo', audience: 'staff', code: sent.demoCode!, password: NEW_PASSWORD })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // A new request issues a fresh code and invalidates older ones.
    const again = await server.handle('auth.requestPasswordReset', { email: 'owner@nilehorizon.demo', audience: 'staff' });
    await expect(server.handle('auth.resetPassword', { email: 'owner@nilehorizon.demo', audience: 'staff', code: again.demoCode!, password: NEW_PASSWORD })).resolves.toEqual({ ok: true });
  });

  it('expires codes after 15 minutes of demo time', async () => {
    let now = Date.UTC(2026, 10, 15, 9, 0, 0);
    const { server } = testServer({ realNow: () => now });
    const sent = await server.handle('auth.requestPasswordReset', { email: 'customer@example.com', audience: 'customer' });
    now += 16 * 60_000;
    await expect(server.handle('auth.resetPassword', { email: 'customer@example.com', audience: 'customer', code: sent.demoCode!, password: NEW_PASSWORD })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('new customers verify their email with the code sent at registration', async () => {
    const { server } = testServer();
    const s = await server.handle('auth.registerCustomer', { name: 'Mona Adel', email: 'mona@example.com', password: NEW_PASSWORD, locale: 'en' });
    expect(s.user.emailVerified).toBe(false);
    const code = (await server.handle('auth.requestEmailVerification', undefined, s.token)).demoCode!;
    await expect(server.handle('auth.verifyEmail', { code: code === '123456' ? '654321' : '123456' }, s.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const verified = await server.handle('auth.verifyEmail', { code }, s.token);
    expect(verified.user.emailVerified).toBe(true);
    expect((await server.handle('auth.requestEmailVerification', undefined, s.token)).demoCode).toBeNull();
    // Seeded demo accounts are already verified.
    const demo = await server.handle('auth.login', { email: 'customer@example.com', password: DEMO_PASSWORD, audience: 'customer' });
    expect(demo.user.emailVerified).toBe(true);
  });
});

describe('customer favorites', () => {
  it('toggles favorites per customer and keeps them private', async () => {
    const { server } = testServer();
    const a = await server.handle('auth.login', { email: 'customer@example.com', password: DEMO_PASSWORD, audience: 'customer' });
    const result = (await server.handle('search.run', { serviceType: 'hotel', from: '2026-12-20', to: '2026-12-23', adults: 2, children: 0, infants: 0, destinationId: (await server.handle('reference.destinations', { page: 1, pageSize: 50 })).items.find((d) => d.code === 'LXR')!.id })).items[0]!;
    const fav = { key: result.key, serviceType: result.serviceType, name: result.name, destinationId: result.destinationId, destinationName: result.destinationName, imageSeed: result.imageSeed, rating: result.rating };
    expect(await server.handle('favorites.toggle', fav, a.token)).toEqual({ favorited: true });
    expect((await server.handle('favorites.list', undefined, a.token)).map((f) => f.key)).toEqual([result.key]);
    const b = await server.handle('auth.registerCustomer', { name: 'Other Person', email: 'other@example.com', password: NEW_PASSWORD, locale: 'en' });
    expect(await server.handle('favorites.list', undefined, b.token)).toEqual([]);
    expect(await server.handle('favorites.toggle', fav, a.token)).toEqual({ favorited: false });
    expect(await server.handle('favorites.list', undefined, a.token)).toEqual([]);
    const staff = await server.handle('auth.login', { email: 'owner@nilehorizon.demo', password: DEMO_PASSWORD, audience: 'staff' });
    await expect(server.handle('favorites.list', undefined, staff.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
