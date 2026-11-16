import { describe, expect, it } from 'vitest';
import type { CheckoutInput } from '@travelta/schemas';
import { checkoutCart, destId, findOffer, firstCustomer, login, type Server } from './test-flows';
import { testServer } from './test-utils';

const hotel = async (server: Server, code = 'LXR') => ({ serviceType: 'hotel' as const, destinationId: await destId(server, code), from: '2026-12-01', to: '2026-12-04', rooms: [{ adults: 2, childAges: [] }] });

async function book(server: Server, token: string, pick: (name: string, ownership: string) => boolean, code = 'LXR', payment?: CheckoutInput['payment']) {
  const { option, result } = await findOffer(server, token, await hotel(server, code), pick);
  await server.handle('cart.addOffer', { offerId: option.offerId }, token);
  const booking = await checkoutCart(server, token, { customerId: await firstCustomer(server, token), ...(payment ? { payment } : {}) });
  return { booking, result, option };
}
const partial = (total: number) => ({ method: 'plan' as const, type: 'partial' as const, installments: [{ amountMinor: total - 10000, dueDate: '2026-11-20' }, { amountMinor: 10000, dueDate: '2026-11-28' }] });

describe('live-API items (adapter book())', () => {
  it('confirm immediately with the supplier reference and a request log visible to platform staff only', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { booking } = await book(server, nile.token, (_, o) => o === 'api');
    expect(booking.items[0]).toMatchObject({ status: 'confirmed', holdReason: null });
    expect(booking.items[0]!.supplierRef).toMatch(/^(TBO|HB)-\d{7}$/);
    expect(booking.status).toBe('confirmed');
    await expect(server.handle('bookings.supplierLogs', { bookingId: booking.id }, nile.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const admin = await login(server, 'admin@travelta.demo');
    const logs = await server.handle('bookings.supplierLogs', { bookingId: booking.id }, admin.token);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ operation: 'book', outcome: 'confirmed' });
  });

  it('honours the Demo panel override: reject, then timeout → retry', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    await server.handle('demo.setSimulation', { nextSupplierResponse: 'reject' });
    const rejected = (await book(server, nile.token, (_, o) => o === 'api')).booking;
    expect(rejected.items[0]).toMatchObject({ status: 'rejected', rejectReason: 'Supplier declined the booking' });
    expect(rejected.status).toBe('cancelled');
    expect((await server.handle('demo.status', undefined)).nextSupplierResponse).toBe('auto'); // one-shot

    await server.handle('demo.setSimulation', { nextSupplierResponse: 'timeout' });
    const timedOut = (await book(server, nile.token, (_, o) => o === 'api')).booking;
    expect(timedOut.items[0]).toMatchObject({ status: 'pending', holdReason: 'awaiting_supplier' });
    expect(timedOut.items[0]!.actions).toContain('retry');
    const retried = await server.handle('bookings.retrySupplier', { bookingId: timedOut.id, itemId: timedOut.items[0]!.id }, nile.token);
    expect(retried.items[0]!.status).toBe('confirmed');
  });
});

describe('network & own suppliers confirm (W5, W9)', () => {
  it('the network supplier confirms its item; stock is consumed only then; others cannot act', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { booking, result } = await book(server, nile.token, (_, o) => o === 'network');
    const item = booking.items[0]!;
    expect(item).toMatchObject({ status: 'pending', holdReason: 'awaiting_supplier', supplierName: 'Pharaoh Stays Group' });
    expect(item.actions).not.toContain('confirm'); // the agency does not confirm network stock
    await expect(server.handle('bookings.confirmItem', { bookingId: booking.id, itemId: item.id, supplierRef: 'X1' }, nile.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const desert = await login(server, 'supplier@desertpulse.demo');
    expect((await server.handle('bookings.board', { page: 1, pageSize: 50 }, desert.token)).total).toBe(0);
    await expect(server.handle('bookings.get', { id: booking.id }, desert.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const board = await server.handle('bookings.board', { page: 1, pageSize: 50, filters: { status: 'pending' } }, pharaoh.token);
    expect(board.items[0]).toMatchObject({ ref: booking.ref, actions: ['confirm', 'reject'] });
    const calendar = (unitId: string) => server.handle('inventory.calendar', { productId: result.productId!, unitId, from: '2026-12-01', days: 3 }, pharaoh.token);
    const before = await calendar(item.unitId!);
    const confirmed = await server.handle('bookings.confirmItem', { bookingId: booking.id, itemId: item.id, supplierRef: 'PS-55821' }, pharaoh.token);
    expect(confirmed.items[0]).toMatchObject({ status: 'confirmed', supplierRef: 'PS-55821', stockConsumed: true });
    const unitId = confirmed.items[0]!.unitId!;
    const after = await calendar(unitId);
    expect(after.map((d) => d.sold)).toEqual(before.map((d) => d.sold + 1)); // 3 nights × 1 room, consumed at confirmation
    await expect(server.handle('bookings.confirmItem', { bookingId: booking.id, itemId: item.id, supplierRef: 'again' }, pharaoh.token)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('the agency confirms its own contracted stock; a supplier rejection cancels the booking', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const own = (await book(server, nile.token, (name, o) => o === 'agency_own' && name === 'Golden Pyramids Hotel', 'GIZ')).booking;
    expect(own.items[0]!.actions).toEqual(expect.arrayContaining(['confirm', 'reject']));
    const confirmed = await server.handle('bookings.confirmItem', { bookingId: own.id, itemId: own.items[0]!.id, supplierRef: 'GP-1001' }, nile.token);
    expect(confirmed.status).toBe('confirmed');

    const network = (await book(server, nile.token, (_, o) => o === 'network')).booking;
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const rejected = await server.handle('bookings.rejectItem', { bookingId: network.id, itemId: network.items[0]!.id, reason: 'Hotel overbooked' }, pharaoh.token);
    expect(rejected.items[0]).toMatchObject({ status: 'rejected', rejectReason: 'Hotel overbooked' });
    expect(rejected.status).toBe('cancelled');
    expect(rejected.events.map((e) => e.to)).toEqual(expect.arrayContaining(['pending', 'rejected', 'cancelled']));
  });

  it('a confirmation without stock left turns into a SOLD_OUT rejection', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { booking, result } = await book(server, nile.token, (_, o) => o === 'network');
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    await server.handle('inventory.bulkUpdate', { productId: result.productId!, unitIds: [booking.items[0]!.unitId!], from: '2026-12-02', to: '2026-12-02', weekdays: [], set: { allotment: 0 } }, pharaoh.token);
    const out = await server.handle('bookings.confirmItem', { bookingId: booking.id, itemId: booking.items[0]!.id, supplierRef: 'PS-1' }, pharaoh.token);
    expect(out.items[0]).toMatchObject({ status: 'rejected', rejectReason: 'Sold out at confirmation (SOLD_OUT)', stockConsumed: false });
  });

  it('derives partially_confirmed for mixed items', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const a = await findOffer(server, nile.token, await hotel(server), (_, o) => o === 'api');
    const b = await findOffer(server, nile.token, await hotel(server), (_, o) => o === 'network');
    await server.handle('cart.addOffer', { offerId: a.option.offerId }, nile.token);
    await server.handle('cart.addOffer', { offerId: b.option.offerId }, nile.token);
    const booking = await checkoutCart(server, nile.token, { customerId: await firstCustomer(server, nile.token) });
    expect(booking.status).toBe('partially_confirmed');
    expect((await server.handle('bookings.list', { page: 1, pageSize: 5 }, nile.token)).items[0]!.holdReasons).toEqual(['awaiting_supplier']);
  });
});

describe('vouchers, travel and ops (BKG-6/7)', () => {
  it('vouchers need payment or an agreed plan; numbers follow the booking ref', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const unpaid = (await book(server, nile.token, (_, o) => o === 'api')).booking;
    expect(unpaid.items[0]!.actions).not.toContain('voucher');
    await expect(server.handle('bookings.voucherItem', { bookingId: unpaid.id, itemId: unpaid.items[0]!.id }, nile.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const { option } = await findOffer(server, nile.token, await hotel(server), (_, o) => o === 'api');
    const planned = (await book(server, nile.token, (_, o) => o === 'api', 'LXR', partial(option.priceMinor))).booking;
    expect(planned.items[0]!.actions).toContain('voucher');
    const v = await server.handle('bookings.voucherItem', { bookingId: planned.id, itemId: planned.items[0]!.id }, nile.token);
    expect(v.items[0]!.voucherNo).toBe(`VCH-${planned.ref.slice(4)}-1`);
    expect(v.status).toBe('vouchered');
  });

  it('auto-travels after the service date (demo clock) and allows no-show on vouchered items', async () => {
    const { server } = testServer();
    let nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, await hotel(server), (_, o) => o === 'api');
    const a = (await book(server, nile.token, (_, o) => o === 'api', 'LXR', partial(option.priceMinor))).booking;
    await server.handle('bookings.voucherItem', { bookingId: a.id, itemId: a.items[0]!.id }, nile.token);
    const b = (await book(server, nile.token, (_, o) => o === 'api', 'HRG')).booking;
    await server.handle('demo.setClock', { offsetDays: 16 }); // 1 Dec: travel day (sessions expire as time passes)
    nile = await login(server, 'owner@nilehorizon.demo');
    const onDay = await server.handle('bookings.get', { id: a.id }, nile.token);
    expect(onDay.items[0]!.actions).toContain('no_show');
    const ns = await server.handle('bookings.markNoShow', { bookingId: a.id, itemId: a.items[0]!.id }, nile.token);
    expect(ns.items[0]!.status).toBe('no_show');

    await server.handle('demo.setClock', { offsetDays: 40 });
    nile = await login(server, 'owner@nilehorizon.demo');
    const later = await server.handle('bookings.get', { id: b.id }, nile.token);
    expect(later.items[0]!.status).toBe('travelled');
    expect(later.status).toBe('travelled');
    expect(later.events.at(-1)).toMatchObject({ to: 'travelled', actorName: 'System' });
  });

  it('ops fill PNR/driver details and notes; prices never change; suppliers cannot add notes', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { booking } = await book(server, nile.token, (_, o) => o === 'network');
    const ops = await login(server, 'ops@nilehorizon.demo');
    const updated = await server.handle('bookings.updateItemDetails', { bookingId: booking.id, itemId: booking.items[0]!.id, details: { specialRequests: 'Late arrival 23:00' } }, ops.token);
    expect(updated.items[0]!.details.specialRequests).toBe('Late arrival 23:00');
    expect(updated.items[0]!.priceMinor).toBe(booking.items[0]!.priceMinor);
    const noted = await server.handle('bookings.addNote', { bookingId: booking.id, text: 'Called the hotel' }, ops.token);
    expect(noted.notes.at(-1)).toMatchObject({ text: 'Called the hotel' });
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    await expect(server.handle('bookings.addNote', { bookingId: booking.id, text: 'x' }, pharaoh.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await server.handle('bookings.get', { id: booking.id }, pharaoh.token)).notes).toEqual([]);
  });
});
