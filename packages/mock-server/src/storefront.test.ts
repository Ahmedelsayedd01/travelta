import { describe, expect, it } from 'vitest';
import { checkoutCart, destId, findOffer, login, loginCustomer } from './test-flows';
import { testServer } from './test-utils';

const hotel = async (server: Parameters<typeof destId>[0]) => ({ serviceType: 'hotel' as const, destinationId: await destId(server, 'LXR'), from: '2026-12-10', to: '2026-12-13', rooms: [{ adults: 2, childAges: [] }] });

/** M21 storefront (Travelta Direct): promo codes, pay later → pay online, self-service cancellation, support, profile. */
describe('B2C storefront', () => {
  it('applies a promo code to the cart and counts its use at checkout', async () => {
    const { server } = testServer();
    const sara = await loginCustomer(server);
    const { option } = await findOffer(server, sara.token, await hotel(server), (_, o) => o === 'network');
    await server.handle('cart.addOffer', { offerId: option.offerId }, sara.token);
    const before = await server.handle('cart.get', {}, sara.token);
    await expect(server.handle('cart.applyPromo', { code: 'NOPE99' }, sara.token)).rejects.toMatchObject({ details: [{ field: 'code', issue: 'validation.promo_invalid' }] });
    await expect(server.handle('cart.applyPromo', { code: 'NILE5' }, sara.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' }); // another seller's code
    const after = await server.handle('cart.applyPromo', { code: 'welcome10' }, sara.token);
    expect(after.promoCode).toBe('WELCOME10');
    expect(after.discountMinor).toBeGreaterThan(0);
    expect(after.totalMinor).toBeLessThan(before.totalMinor);
    await checkoutCart(server, sara.token, { payment: { method: 'pay_later' } });
    const admin = await login(server, 'admin@travelta.demo');
    const switched = await server.handle('auth.switchOrg', { tenantId: (await server.handle('auth.me', undefined, admin.token)).memberships.find((m) => m.orgName.en === 'Travelta Direct')!.tenantId }, admin.token);
    const promos = await server.handle('promoCodes.list', undefined, switched.token);
    expect(promos.find((x) => x.code === 'WELCOME10')!.uses).toBe(38);
  });

  it('pay later → pay online by card → cancel with a card refund, all by the customer', async () => {
    const { server } = testServer();
    const sara = await loginCustomer(server);
    const { option } = await findOffer(server, sara.token, await hotel(server), (_, o) => o === 'network');
    await server.handle('cart.addOffer', { offerId: option.offerId }, sara.token);
    const booking = await checkoutCart(server, sara.token, { payment: { method: 'pay_later' } });
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    await server.handle('bookings.confirmItem', { bookingId: booking.id, itemId: booking.items[0]!.id, supplierRef: 'PS-9' }, pharaoh.token);
    await expect(server.handle('account.payByCard', { bookingId: booking.id, card: { number: '4000000000000002', expiry: '12/29', cvc: '123', holder: 'Sara Ali' } }, sara.token)).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    const fin = await server.handle('account.payByCard', { bookingId: booking.id, card: { number: '4242424242424242', expiry: '12/29', cvc: '123', holder: 'Sara Ali' } }, sara.token);
    expect(fin).toMatchObject({ outstandingMinor: 0 });
    const mine = await server.handle('bookings.get', { id: booking.id }, sara.token);
    expect(mine.paymentStatus).toBe('paid');
    expect(mine.items[0]!.actions).toEqual(['cancel']);
    const q = await server.handle('cancellations.quote', { bookingId: booking.id, itemId: booking.items[0]!.id }, sara.token);
    expect(q).toMatchObject({ needsApproval: false, refundMethods: ['card'] });
    await server.handle('cancellations.request', { bookingId: booking.id, itemId: booking.items[0]!.id, reason: 'Change of plans', refundMethod: 'card' }, sara.token);
    const f2 = await server.handle('bookings.finance', { bookingId: booking.id }, sara.token);
    expect(f2.payments.find((x) => x.direction === 'out')).toMatchObject({ method: 'card', amountMinor: q.refundMinor });
    // Customers never act on someone else's booking.
    const nile = await login(server, 'owner@nilehorizon.demo');
    await expect(server.handle('account.payByCard', { bookingId: booking.id, card: { number: '4242424242424242', expiry: '12/29', cvc: '123', holder: 'Ahmed Samir' } }, nile.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('support requests reach the seller team; profile updates sync to the customer record', async () => {
    const { server } = testServer();
    const sara = await loginCustomer(server);
    const t = await server.handle('account.support', { topic: 'payment', bookingId: null, message: 'Can I pay by bank transfer instead?' }, sara.token);
    expect(t.ticket).toMatch(/^SUP-\d{5}$/);
    const admin = await login(server, 'admin@travelta.demo');
    const directId = (await server.handle('auth.me', undefined, admin.token)).memberships.find((m) => m.orgName.en === 'Travelta Direct')!.tenantId;
    const direct = await server.handle('auth.switchOrg', { tenantId: directId }, admin.token);
    const bell = await server.handle('notifications.list', { page: 1, pageSize: 5, filters: { topic: 'support.request' } }, direct.token);
    expect(bell.total).toBe(1);
    const p = await server.handle('account.updateProfile', { name: 'Sara A. Ali', phone: '+201005550000', locale: 'ar', nationalityIso2: 'EG' }, sara.token);
    expect(p.locale).toBe('ar');
    const c = await server.handle('customers.list', { page: 1, pageSize: 50, q: 'Sara A. Ali' }, direct.token);
    expect(c.items[0]!.phone).toBe('+201005550000');
  });
});
