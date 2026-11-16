import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './seed/identity';
import { testServer } from './test-utils';

const customer = (server: ReturnType<typeof testServer>['server'], email = 'customer@example.com', password = DEMO_PASSWORD) =>
  server.handle('auth.login', { email, password, audience: 'customer' });
const T = { type: 'adult' as const, title: 'mrs' as const, firstName: 'Sara', lastName: 'Ali', dateOfBirth: '1990-04-02', nationalityIso2: 'EG', passportNo: 'A1234567', passportExpiry: '2030-01-01' };

describe('customer account', () => {
  it('saved travellers: CRUD, validation and isolation between customers', async () => {
    const { server } = testServer();
    const a = await customer(server);
    const saved = await server.handle('travelers.save', T, a.token);
    expect((await server.handle('travelers.list', undefined, a.token)).map((x) => x.id)).toEqual([saved.id]);
    const edited = await server.handle('travelers.save', { ...T, id: saved.id, firstName: 'Sarah' }, a.token);
    expect(edited.firstName).toBe('Sarah');
    await expect(server.handle('travelers.save', { ...T, passportExpiry: '2026-01-01' }, a.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(server.handle('travelers.save', { ...T, type: 'child', dateOfBirth: null }, a.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(server.handle('travelers.save', { ...T, dateOfBirth: '2030-01-01' }, a.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const b = await server.handle('auth.registerCustomer', { name: 'Other', email: 'other@example.com', password: 'Other#2026a', locale: 'en' });
    expect(await server.handle('travelers.list', undefined, b.token)).toEqual([]);
    await expect(server.handle('travelers.save', { ...T, id: saved.id }, b.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(server.handle('travelers.delete', { id: saved.id }, b.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await server.handle('travelers.delete', { id: saved.id }, a.token);
    expect(await server.handle('travelers.list', undefined, a.token)).toEqual([]);
    const staff = await server.handle('auth.login', { email: 'owner@nilehorizon.demo', password: DEMO_PASSWORD, audience: 'staff' });
    await expect(server.handle('travelers.list', undefined, staff.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('password change needs the current password and signs out other sessions only', async () => {
    const { server } = testServer();
    const here = await customer(server);
    const other = await customer(server);
    await expect(server.handle('account.changePassword', { currentPassword: 'Wrong#123x', newPassword: 'New#Trip2027' }, here.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await server.handle('account.changePassword', { currentPassword: DEMO_PASSWORD, newPassword: 'New#Trip2027' }, here.token);
    await expect(server.handle('auth.me', undefined, here.token)).resolves.toMatchObject({ user: { email: 'customer@example.com' } });
    await expect(server.handle('auth.me', undefined, other.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(customer(server)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(customer(server, 'customer@example.com', 'New#Trip2027')).resolves.toBeDefined();
  });

  it('profile reads back what was saved (nationality included)', async () => {
    const { server } = testServer();
    const a = await customer(server);
    await server.handle('account.updateProfile', { name: 'Sara A. Ali', phone: '+201001112233', locale: 'en', nationalityIso2: 'JO' }, a.token);
    expect(await server.handle('account.profile', undefined, a.token)).toMatchObject({ name: 'Sara A. Ali', phone: '+201001112233', nationalityIso2: 'JO', email: 'customer@example.com' });
  });

  it('support tickets are stored and listed for their customer only', async () => {
    const { server } = testServer();
    const a = await customer(server);
    const { ticket } = await server.handle('account.support', { topic: 'payment', message: 'My card was charged twice for the same booking.' }, a.token);
    const list = await server.handle('account.tickets', undefined, a.token);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ ref: ticket, topic: 'payment', status: 'open', bookingRef: null });
    const b = await server.handle('auth.registerCustomer', { name: 'Other', email: 'other2@example.com', password: 'Other#2026a', locale: 'en' });
    expect(await server.handle('account.tickets', undefined, b.token)).toEqual([]);
  });
});
