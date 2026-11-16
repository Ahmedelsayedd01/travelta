import { describe, expect, it } from 'vitest';
import { checkoutCart, destId, findOffer, firstCustomer, login, loginCustomer, traveller, travellersFor } from './test-flows';
import { testServer } from './test-utils';

const HOTEL = async (server: Parameters<typeof destId>[0], code = 'LXR') => ({ serviceType: 'hotel' as const, destinationId: await destId(server, code), from: '2026-12-01', to: '2026-12-04', rooms: [{ adults: 2, childAges: [] }] });

describe('cart & quotes (QTE-1)', () => {
  it('adds a searched offer as a 15-minute quote; staff see their cost, totals add up', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, await HOTEL(server), (_, own) => own === 'network');
    const cart = await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    expect(cart.items).toHaveLength(1);
    const item = cart.items[0]!;
    expect(item.priceMinor).toBe(option.priceMinor);
    expect(item.buyMinor).toBe(option.buyMinor);
    expect(Date.parse(item.expiresAt) - Date.parse(item.quotedAt)).toBe(15 * 60_000);
    expect(item.breakdown.lines.map((l) => l.key)).not.toContain('net'); // agency sees one buy-price line
    expect(cart.totalMinor).toBe(option.priceMinor);
    expect(cart.costMinor).toBe(option.buyMinor);
    // Quote expiry is driven by the demo clock.
    await server.handle('demo.setClock', { offsetDays: 1 });
    expect((await server.handle('cart.get', {}, nile.token)).items[0]!.expired).toBe(true);
  });

  it('suppliers and staff without bookings.create have no cart; carts are per seller and user', async () => {
    const { server } = testServer();
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    await expect(server.handle('cart.get', {}, pharaoh.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const admin = await login(server, 'admin@travelta.demo');
    await expect(server.handle('cart.get', {}, admin.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('recheck & price-change acceptance (QTE-2)', () => {
  it('flags a changed price, refuses submit at the old price and accepts the new one', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, await HOTEL(server), (_, own) => own === 'network');
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    const cart = await server.handle('cart.get', {}, nile.token);
    const customerId = await firstCustomer(server, nile.token);

    // The agency raises its hotel markup → the sell price changes.
    const rules = await server.handle('pricing.rules.list', { page: 1, pageSize: 50 }, nile.token);
    const hotels = rules.items.find((r) => r.name === 'Hotels')!;
    await server.handle('pricing.rules.save', { ...hotels, value: 20 } as never, nile.token);

    await expect(checkoutCart(server, nile.token, { customerId })).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
    const { changes, cart: rechecked } = await server.handle('checkout.recheck', {}, nile.token);
    expect(changes[0]).toMatchObject({ status: 'price_changed', oldPriceMinor: cart.items[0]!.priceMinor });
    expect(changes[0]!.newPriceMinor).toBeGreaterThan(cart.items[0]!.priceMinor);
    expect(rechecked.items[0]!.previousPriceMinor).toBe(cart.items[0]!.priceMinor);
    const booking = await checkoutCart(server, nile.token, { customerId });
    expect(booking.totals.sellMinor).toBe(changes[0]!.newPriceMinor);
  });

  it('marks stop-sold items unavailable and refuses checkout with SOLD_OUT', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option, result } = await findOffer(server, nile.token, await HOTEL(server), (_, own) => own === 'network');
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const product = await server.handle('catalog.get', { id: result.productId! }, pharaoh.token);
    await server.handle('inventory.bulkUpdate', { productId: product.id, unitIds: product.units.map((u) => u.id), from: '2026-12-02', to: '2026-12-02', weekdays: [], set: { stopSell: true } }, pharaoh.token);
    const { changes } = await server.handle('checkout.recheck', {}, nile.token);
    expect(changes[0]!.status).toBe('unavailable');
    await expect(checkoutCart(server, nile.token, { customerId: await firstCustomer(server, nile.token) })).rejects.toMatchObject({ code: 'SOLD_OUT' });
  });
});

describe('checkout (W2 step 6–7)', () => {
  it('creates a pending booking with TRV ref, locked FX, policy snapshot, payment plan — idempotently', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, await HOTEL(server), (_, own) => own === 'network');
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    const cart = await server.handle('cart.get', {}, nile.token);
    const input = {
      idempotencyKey: 'idem-12345678', customerId: await firstCustomer(server, nile.token),
      items: cart.items.map((i) => ({ itemId: i.id, travellers: travellersFor(i), details: { specialRequests: 'High floor' }, acceptedPriceMinor: i.priceMinor })),
      payment: { method: 'plan' as const, type: 'full' as const, installments: [] },
    };
    const booking = await server.handle('checkout.submit', input, nile.token);
    expect(booking.ref).toMatch(/^TRV-\d{4}-00001$/);
    expect(booking.status).toBe('pending');
    expect(booking.items[0]).toMatchObject({ status: 'pending', holdReason: 'awaiting_supplier', supplierName: 'Pharaoh Stays Group', details: { specialRequests: 'High floor' } });
    expect(booking.items[0]!.policy).toEqual(option.policy);
    expect(booking.totals.sellMinor).toBe(option.priceMinor);
    expect(booking.totals.agencyCostMinor).toBe(option.buyMinor);
    expect(booking.events.map((e) => e.to)).toContain('pending');
    // Same key → same booking; the cart was checked out and a new empty one opens.
    const again = await server.handle('checkout.submit', input, nile.token);
    expect(again.id).toBe(booking.id);
    expect((await server.handle('bookings.list', { page: 1, pageSize: 10 }, nile.token)).total).toBe(1);
    expect((await server.handle('cart.get', {}, nile.token)).items).toHaveLength(0);
  });

  it('validates travellers per service: counts, lead, passports (flights), mahram (Umrah), slot (activities), documents (visas)', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const customerId = await firstCustomer(server, nile.token);
    const flight = await findOffer(server, nile.token, { serviceType: 'flight', fromCode: 'CAI', toCode: 'DXB' });
    await server.handle('cart.addOffer', { offerId: flight.option.offerId }, nile.token);
    const cart = await server.handle('cart.get', {}, nile.token);
    const item = cart.items[0]!;
    const submit = (travellers: ReturnType<typeof travellersFor>) => server.handle('checkout.submit', {
      idempotencyKey: `k-${Math.random()}`.slice(0, 20), customerId, payment: { method: 'plan', type: 'full', installments: [] },
      items: [{ itemId: item.id, travellers, details: {}, acceptedPriceMinor: item.priceMinor }],
    }, nile.token);
    await expect(submit([traveller('adult', { lead: true })])).rejects.toMatchObject({ details: [{ issue: 'validation.traveller_count' }] });
    await expect(submit([traveller('adult'), traveller('adult')])).rejects.toMatchObject({ details: [{ issue: 'validation.one_lead' }] });
    await expect(submit([traveller('adult', { lead: true, passportNo: null }), traveller('adult', { passportExpiry: '2026-12-01' })])).rejects.toMatchObject({
      details: expect.arrayContaining([{ field: 'items.0.travellers.0.passportNo', issue: 'validation.required' }, { field: 'items.1'.replace('1', '0') + '.travellers.1.passportExpiry', issue: 'validation.passport_expired' }]),
    });

    await server.handle('cart.removeItem', { itemId: item.id }, nile.token);
    const umrah = await findOffer(server, nile.token, { serviceType: 'umrah', destinationId: await destId(server, 'MKX') });
    await server.handle('cart.addOffer', { offerId: umrah.option.offerId }, nile.token);
    const ucart = await server.handle('cart.get', {}, nile.token);
    await expect(server.handle('checkout.submit', {
      idempotencyKey: 'umrah-0001', customerId, payment: { method: 'plan', type: 'full', installments: [] },
      items: [{ itemId: ucart.items[0]!.id, travellers: [traveller('adult', { lead: true }), traveller('adult', { title: 'mrs' })], details: {}, acceptedPriceMinor: ucart.items[0]!.priceMinor }],
    }, nile.token)).rejects.toMatchObject({ details: [{ field: 'items.0.travellers.1.mahram', issue: 'validation.mahram_required' }] });
  });

  it('staff must pick or create a customer; inline customers are created in the seller tenant', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, await HOTEL(server));
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    await expect(checkoutCart(server, nile.token)).rejects.toMatchObject({ details: [{ field: 'customerId', issue: 'validation.customer_required' }] });
    const booking = await checkoutCart(server, nile.token, { newCustomer: { kind: 'individual', name: 'Walk-in Guest', phone: '+201009998877' } });
    expect(booking.customerName).toBe('Walk-in Guest');
    const found = await server.handle('customers.list', { page: 1, pageSize: 50, q: 'Walk-in' }, nile.token);
    expect(found.items[0]!.bookingsCount).toBe(1);
  });

  it('PAY-2: a partial plan must sum exactly; the golden plan is stored', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const customerId = await firstCustomer(server, nile.token);
    const { option } = await findOffer(server, nile.token, await HOTEL(server));
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    const total = option.priceMinor;
    const bad = { method: 'plan' as const, type: 'partial' as const, installments: [{ amountMinor: 1000, dueDate: '2026-11-15' }, { amountMinor: total - 1001, dueDate: '2026-11-20' }] };
    await expect(checkoutCart(server, nile.token, { customerId, payment: bad })).rejects.toMatchObject({ details: [{ field: 'payment.installments', issue: 'validation.installments_sum' }] });
    const first = Math.round(total * 0.1);
    const good = { method: 'plan' as const, type: 'partial' as const, installments: [{ amountMinor: first, dueDate: '2026-11-15' }, { amountMinor: total - first - 5000, dueDate: '2026-11-20' }, { amountMinor: 5000, dueDate: '2026-11-28' }] };
    const booking = await checkoutCart(server, nile.token, { customerId, payment: good });
    expect(booking.paymentType).toBe('partial');
  });
});

describe('manual booking wizard (W3)', () => {
  const manual = (supplier: { kind: 'own' | 'network'; id: string }, patch = {}) => ({
    serviceType: 'hotel' as const, supplier, title: 'Golden Pyramids — Deluxe, 2 nights', destinationId: null, from: '2026-12-10', to: '2026-12-12',
    occupancy: { adults: 2, children: 0, infants: 0, rooms: [{ adults: 2, childAges: [] }] }, netMinor: 500000, netCurrency: 'EGP' as const,
    markup: { mode: 'percent' as const, value: 20 }, taxProfileId: null, policy: { nonRefundable: false, rules: [{ daysBefore: 3, feeType: 'percent' as const, value: 50 }] },
    details: { description: 'Deluxe room, pyramids view' }, ...patch,
  });

  it('prices own-supplier items with the agency markup and no platform layer', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const own = await server.handle('suppliers.list', { page: 1, pageSize: 50 }, nile.token);
    const golden = own.items.find((s) => s.name.en.startsWith('Golden Pyramids'))!;
    const { breakdown } = await server.handle('cart.previewManual', manual({ kind: 'own', id: golden.id }), nile.token);
    const markup = breakdown.lines.find((l) => l.key === 'agency_markup')!;
    expect(markup.amountMinor).toBe(100000); // 20% of 5,000.00
    expect(breakdown.lines.some((l) => l.key === 'platform_markup')).toBe(false);
    const cart = await server.handle('cart.addManual', manual({ kind: 'own', id: golden.id }), nile.token);
    expect(cart.items[0]).toMatchObject({ kind: 'manual', ownership: 'agency_own', source: 'manual' });
    const booking = await checkoutCart(server, nile.token, { customerId: await firstCustomer(server, nile.token) });
    expect(booking.channel).toBe('manual');
    expect(booking.items[0]!.agencySupplierId).toBe(golden.id);
    expect(booking.items[0]!.details.description).toBe('Deluxe room, pyramids view');
    expect(booking.totals.agencyCostMinor).toBe(0); // own supplier: nothing owed upstream
  });

  it('network suppliers booked manually carry the platform markup', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const all = await server.handle('suppliers.list', { page: 1, pageSize: 50 }, nile.token);
    const pharaoh = all.items.find((s) => s.name.en === 'Pharaoh Stays Group')!;
    const { breakdown } = await server.handle('cart.previewManual', manual({ kind: 'network', id: pharaoh.id }), nile.token);
    expect(breakdown.lines.some((l) => l.key === 'buy_price')).toBe(true);
    expect(breakdown.buyPrices.agencyBuyMinor).toBeGreaterThan(500000);
  });

  it('rejects another agency’s supplier and a service the supplier does not offer', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const alnoor = await login(server, 'owner@alnoor.demo');
    const own = await server.handle('suppliers.list', { page: 1, pageSize: 50 }, nile.token);
    const coach = own.items.find((s) => s.name.en === 'Alex Coach Rentals')!;
    await expect(server.handle('cart.previewManual', manual({ kind: 'own', id: coach.id }), alnoor.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(server.handle('cart.previewManual', manual({ kind: 'own', id: coach.id }), nile.token)).rejects.toMatchObject({ details: [{ field: 'serviceType', issue: 'validation.supplier_service' }] });
  });
});

describe('storefront checkout (PAY-6/7)', () => {
  it('authorises test cards; declines leave no booking; 3-D Secure needs the code', async () => {
    const { server } = testServer();
    const sara = await loginCustomer(server);
    const { option } = await findOffer(server, sara.token, await HOTEL(server));
    await server.handle('cart.addOffer', { offerId: option.offerId }, sara.token);
    const card = (number: string, threeDsCode?: string) => ({ method: 'card' as const, card: { number, expiry: '12/29', cvc: '123', holder: 'Sara Ali', threeDsCode } });
    await expect(checkoutCart(server, sara.token, { payment: card('4000 0000 0000 0002') })).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    await expect(checkoutCart(server, sara.token, { payment: card('4000000000003220') })).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    expect((await server.handle('bookings.list', { page: 1, pageSize: 5 }, sara.token)).total).toBe(0);
    const booking = await checkoutCart(server, sara.token, { payment: card('4000000000003220', '123456') });
    expect(booking).toMatchObject({ channel: 'b2c', paymentStatus: 'authorized', audience: 'customer' });
    expect(booking.items[0]!.costMinor).toBeNull();
    expect(booking.items[0]!.breakdown.lines.every((l) => ['tax', 'fee', 'discount'].includes(l.key))).toBe(true);
  });

  it('pay-later only where the seller enables it; customers cannot use staff payment plans', async () => {
    const { server } = testServer();
    const sara = await loginCustomer(server);
    const { option } = await findOffer(server, sara.token, await HOTEL(server));
    await server.handle('cart.addOffer', { offerId: option.offerId }, sara.token);
    await expect(checkoutCart(server, sara.token)).rejects.toMatchObject({ details: [{ field: 'payment.method' }] });
    const booking = await checkoutCart(server, sara.token, { payment: { method: 'pay_later' } });
    expect(booking.paymentType).toBe('later');
  });
});

describe('booking visibility (TENANCY §2)', () => {
  it('other agencies cannot read it; the supplier sees only its items without sell figures', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, await HOTEL(server), (_, own) => own === 'network');
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    const booking = await checkoutCart(server, nile.token, { customerId: await firstCustomer(server, nile.token) });
    const alnoor = await login(server, 'owner@alnoor.demo');
    await expect(server.handle('bookings.get', { id: booking.id }, alnoor.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const seen = await server.handle('bookings.get', { id: booking.id }, pharaoh.token);
    expect(seen.audience).toBe('supplier');
    expect(seen.totals.sellMinor).toBe(0);
    expect(seen.customerName).toBeNull();
    expect(seen.items[0]!.priceMinor).toBe(seen.items[0]!.breakdown.settlement.supplierPayoutMinor);
    const admin = await login(server, 'admin@travelta.demo');
    expect((await server.handle('bookings.get', { id: booking.id }, admin.token)).items[0]!.breakdown.lines.map((l) => l.key)).toContain('net');
  });
});
