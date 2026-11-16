import { describe, expect, it } from 'vitest';
import { checkoutCart, destId, findOffer, firstCustomer, login } from './test-flows';
import { testServer } from './test-utils';

/** M19: events → in-app notifications per role, outbox messages (en/ar), clock reminders. */
describe('notifications', () => {
  it('a network booking alerts the supplier; confirmation notifies the seller and emails the customer', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, { serviceType: 'hotel', destinationId: await destId(server, 'LXR'), from: '2026-12-01', to: '2026-12-04', rooms: [{ adults: 2, childAges: [] }] }, (_, o) => o === 'network');
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    const booking = await checkoutCart(server, nile.token, { customerId: await firstCustomer(server, nile.token) });
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const bell = await server.handle('notifications.list', { page: 1, pageSize: 10 }, pharaoh.token);
    expect(bell.items[0]).toMatchObject({ topic: 'booking.new_reservation', readAt: null });
    expect(bell.items[0]!.title.ar).toContain(booking.ref);
    expect(bell.unread).toBeGreaterThan(0);
    await server.handle('bookings.confirmItem', { bookingId: booking.id, itemId: booking.items[0]!.id, supplierRef: 'PS-1' }, pharaoh.token);
    const ownerBell = await server.handle('notifications.list', { page: 1, pageSize: 10, filters: { topic: 'booking.confirmed' } }, nile.token);
    expect(ownerBell.total).toBe(1);
    const outbox = await server.handle('outbox.list', { page: 1, pageSize: 20 }, nile.token);
    expect(outbox.items.map((m) => m.topic)).toEqual(expect.arrayContaining(['booking.created', 'booking.confirmed']));
    expect(outbox.items[0]!.body.ar.length).toBeGreaterThan(10);
    const read = await server.handle('notifications.markRead', { all: true }, pharaoh.token);
    expect(read.unread).toBe(0);
    // Other tenants never see this outbox.
    const alnoor = await login(server, 'owner@alnoor.demo');
    expect((await server.handle('outbox.list', { page: 1, pageSize: 20 }, alnoor.token)).items.some((m) => m.related?.id === booking.id)).toBe(false);
  });

  it('instalment reminders 3 days before and on the due date, once each; overdue alerts the seller', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, { serviceType: 'hotel', destinationId: await destId(server, 'LXR'), from: '2026-12-01', to: '2026-12-04', rooms: [{ adults: 2, childAges: [] }] }, (_, o) => o === 'api');
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    const total = (await server.handle('cart.get', {}, nile.token)).totalMinor;
    const booking = await checkoutCart(server, nile.token, { customerId: await firstCustomer(server, nile.token), payment: { method: 'plan', type: 'partial', installments: [{ amountMinor: 50_000, dueDate: '2026-11-20' }, { amountMinor: total - 50_000, dueDate: '2026-11-27' }] } });
    const count = async (token: string) => (await server.handle('outbox.list', { page: 1, pageSize: 100, filters: { topic: 'payment.reminder' } }, token)).items.filter((m) => m.related?.id === booking.id).length;
    expect(await count(nile.token)).toBe(0);
    await server.handle('demo.setClock', { offsetDays: 2 }); // 17 Nov = due − 3
    let t = (await login(server, 'owner@nilehorizon.demo')).token;
    expect(await count(t)).toBe(2); // email + WhatsApp
    await server.handle('demo.setClock', { offsetDays: 3 });
    t = (await login(server, 'owner@nilehorizon.demo')).token;
    expect(await count(t)).toBe(2); // no duplicate
    await server.handle('demo.setClock', { offsetDays: 5 }); // due date
    t = (await login(server, 'owner@nilehorizon.demo')).token;
    expect(await count(t)).toBe(4);
    await server.handle('demo.setClock', { offsetDays: 6 });
    t = (await login(server, 'owner@nilehorizon.demo')).token;
    const overdue = await server.handle('notifications.list', { page: 1, pageSize: 20, filters: { topic: 'payment.overdue' } }, t);
    expect(overdue.total).toBe(1);
  });

  it('seeded overdue follow-ups already sit in the assignee bell (deterministic seed)', async () => {
    const { server } = testServer();
    const sales = await login(server, 'sales@nilehorizon.demo');
    const bell = await server.handle('notifications.list', { page: 1, pageSize: 20, filters: { topic: 'crm.follow_up_due' } }, sales.token);
    expect(bell.total).toBeGreaterThan(0);
  });
});
