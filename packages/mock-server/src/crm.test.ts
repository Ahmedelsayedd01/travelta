import { describe, expect, it } from 'vitest';
import { login, travellersFor } from './test-flows';
import { testServer } from './test-utils';

/** CRM-1..4 and W4 through the API. */
describe('CRM pipeline', () => {
  it('scopes leads and requests: agents see their own, owners see everyone (CRM-4)', async () => {
    const { server } = testServer();
    const sales = await login(server, 'sales@nilehorizon.demo');
    const owner = await login(server, 'owner@nilehorizon.demo');
    const mine = await server.handle('crm.requests.list', { page: 1, pageSize: 50 }, sales.token);
    const all = await server.handle('crm.requests.list', { page: 1, pageSize: 50 }, owner.token);
    expect(mine.items.every((r) => r.assigneeName === 'Mariam Adel')).toBe(true);
    expect(all.total).toBeGreaterThan(mine.total);
    const ownersRequest = all.items.find((r) => r.assigneeName === 'Ahmed Samir')!;
    await expect(server.handle('crm.requests.get', { id: ownersRequest.id }, sales.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const alnoor = await login(server, 'owner@alnoor.demo');
    expect((await server.handle('crm.requests.list', { page: 1, pageSize: 50 }, alnoor.token)).total).toBe(0);
    const supplier = await login(server, 'supplier@pharaohstays.demo');
    await expect(server.handle('crm.leads.list', { page: 1, pageSize: 5 }, supplier.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const overdue = await server.handle('crm.followUps.list', { page: 1, pageSize: 20, filters: { state: 'overdue' } }, sales.token);
    expect(overdue.total).toBeGreaterThan(0);
  });

  it('enforces the stage machine; lost needs a reason; won only via the win action (CRM-1)', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const pending = (await server.handle('crm.requests.list', { page: 1, pageSize: 50, filters: { stage: 'pending' } }, owner.token)).items[0]!;
    expect(pending.moves).toEqual(['price_quotation', 'lost']);
    await expect(server.handle('crm.requests.move', { id: pending.id, stage: 'negotiation' }, owner.token)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(server.handle('crm.requests.move', { id: pending.id, stage: 'lost' }, owner.token)).rejects.toMatchObject({ details: [{ field: 'reason' }] });
    const moved = await server.handle('crm.requests.move', { id: pending.id, stage: 'price_quotation' }, owner.token);
    expect(moved.stage).toBe('price_quotation');
    const nego = await server.handle('crm.requests.move', { id: pending.id, stage: 'negotiation' }, owner.token);
    expect(nego.moves).toEqual(['price_quotation', 'won', 'lost']);
    await expect(server.handle('crm.requests.move', { id: pending.id, stage: 'won' }, owner.token)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect((await server.handle('crm.requests.move', { id: pending.id, stage: 'price_quotation' }, owner.token)).stage).toBe('price_quotation');
    const lost = await server.handle('crm.requests.move', { id: pending.id, stage: 'lost', reason: 'Budget too low' }, owner.token);
    expect(lost).toMatchObject({ stage: 'lost', lostReason: 'Budget too low', moves: [] });
  });

  it('lead → request → engine-priced quotation → send → win → checkout links the booking and converts the lead (CRM-2/3)', async () => {
    const { server } = testServer();
    const sales = await login(server, 'sales@nilehorizon.demo');
    const lead = await server.handle('crm.leads.save', { name: 'Karim Lotfy', email: 'karim.lotfy@example.com', phone: '+201001112223', source: 'whatsapp' }, sales.token);
    const request = await server.handle('crm.requests.save', { leadId: lead.id, title: 'Luxor long weekend', serviceType: 'hotel', destination: 'Luxor', from: '2026-12-10', to: '2026-12-13', adults: 2, priority: 'high', expectedRevenueMinor: 2_000_000 }, sales.token);
    expect(request.stage).toBe('pending');
    const suppliers = await server.handle('suppliers.list', { page: 1, pageSize: 20 }, sales.token).catch(() => null);
    const owner = await login(server, 'owner@nilehorizon.demo');
    const own = (suppliers ?? await server.handle('suppliers.list', { page: 1, pageSize: 20 }, owner.token)).items.find((x: { kind?: string; serviceTypes: string[] }) => x.serviceTypes.includes('hotel'))! as { id: string };
    const item = {
      serviceType: 'hotel' as const, supplier: { kind: 'own' as const, id: own.id }, title: 'Golden Pyramids — 3 nights', destinationId: null, from: '2026-12-10', to: '2026-12-13',
      occupancy: { adults: 2, children: 0, infants: 0, rooms: [] }, netMinor: 1_500_000, netCurrency: 'EGP' as const, markup: { mode: 'percent' as const, value: 20 }, taxProfileId: null,
      policy: { nonRefundable: false, rules: [{ daysBefore: 7, feeType: 'percent' as const, value: 50 }] }, details: {},
    };
    const q1 = await server.handle('crm.quotations.save', { requestId: request.id, lines: [item], validUntil: '2026-11-25' }, sales.token);
    expect(q1).toMatchObject({ revision: 1, status: 'draft', costMinor: 1_500_000 });
    expect(q1.totalMinor).toBeGreaterThanOrEqual(1_800_000); // 20% markup (+ tax where configured)
    expect(q1.number).toMatch(/^QT-2026-\d{6}$/);
    let detail = await server.handle('crm.requests.get', { id: request.id }, sales.token);
    expect(detail.request.stage).toBe('price_quotation');
    const q2 = await server.handle('crm.quotations.save', { requestId: request.id, lines: [{ ...item, markup: { mode: 'percent', value: 15 } }], validUntil: '2026-11-25' }, sales.token);
    expect(q2.revision).toBe(2);
    detail = await server.handle('crm.requests.get', { id: request.id }, sales.token);
    expect(detail.quotations.find((q) => q.id === q1.id)!.status).toBe('superseded');
    await server.handle('crm.quotations.send', { id: q2.id, via: 'whatsapp' }, sales.token);
    expect((await server.handle('crm.requests.get', { id: request.id }, sales.token)).request.stage).toBe('negotiation');

    const won = await server.handle('crm.requests.win', { id: request.id, quotationId: q2.id }, sales.token);
    expect(won.cartItems).toBe(1);
    const cart = await server.handle('cart.get', {}, sales.token);
    const booking = await server.handle('checkout.submit', {
      idempotencyKey: 'crm-win-0001', customerId: won.customerId, requestId: request.id,
      items: cart.items.map((i) => ({ itemId: i.id, travellers: travellersFor(i), details: {}, acceptedPriceMinor: i.priceMinor })),
      payment: { method: 'plan', type: 'full', installments: [] },
    }, sales.token);
    detail = await server.handle('crm.requests.get', { id: request.id }, sales.token);
    expect(detail.request).toMatchObject({ stage: 'won', bookingId: booking.id });
    expect(detail.lead!.status).toBe('converted');
    expect(detail.booking!.ref).toBe(booking.ref);
    const c360 = await server.handle('customers.get360', { id: won.customerId }, owner.token);
    expect(c360.customer.email).toBe('karim.lotfy@example.com');
    expect(c360.bookings.map((b) => b.id)).toEqual([booking.id]);
    expect(c360.requests.map((r) => r.id)).toContain(request.id);
    expect(c360.activities.map((a) => a.kind)).toEqual(expect.arrayContaining(['created', 'quotation', 'stage', 'converted', 'booking']));
  });

  it('follow-ups: scheduled, completed, and notes land on the timeline', async () => {
    const { server } = testServer();
    const sales = await login(server, 'sales@nilehorizon.demo');
    const lead = (await server.handle('crm.leads.list', { page: 1, pageSize: 20, filters: { status: 'contacted' } }, sales.token)).items[0]!;
    const f = await server.handle('crm.followUps.save', { entity: { kind: 'lead', id: lead.id }, type: 'call', dueAt: '2026-11-14T10:00:00.000Z', note: 'Call back' }, sales.token);
    expect(f.overdue).toBe(true);
    const done = await server.handle('crm.followUps.complete', { id: f.id, outcome: 'Wants Sharm prices' }, sales.token);
    expect(done).toMatchObject({ overdue: false, outcome: 'Wants Sharm prices' });
    await server.handle('crm.notes.add', { entity: { kind: 'lead', id: lead.id }, text: 'Prefers WhatsApp' }, sales.token);
    const owner = await login(server, 'owner@nilehorizon.demo');
    const managerSees = await server.handle('crm.followUps.list', { page: 1, pageSize: 50 }, owner.token);
    expect(managerSees.items.some((x) => x.id === f.id)).toBe(true);
    const lost = await server.handle('crm.leads.setStatus', { id: lead.id, status: 'lost', reason: 'Not reachable' }, sales.token);
    expect(lost).toMatchObject({ status: 'lost', lostReason: 'Not reachable' });
  });
});
