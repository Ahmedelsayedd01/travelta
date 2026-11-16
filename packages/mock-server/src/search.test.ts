import type { SearchInput } from '@travelta/schemas';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './seed/identity';
import { testServer } from './test-utils';

type Server = ReturnType<typeof testServer>['server'];
const login = (server: Server, email: string) => server.handle('auth.login', { email, password: DEMO_PASSWORD, audience: 'staff' });
const destId = async (server: Server, code: string) => (await server.handle('reference.destinations', { page: 1, pageSize: 100 })).items.find((d) => d.code === code)!.id;
const hotelSearch = async (server: Server, code: string, patch: Partial<SearchInput> = {}): Promise<SearchInput> => ({
  serviceType: 'hotel', destinationId: await destId(server, code), from: '2026-12-01', to: '2026-12-04', adults: 2, children: 0, infants: 0,
  rooms: [{ adults: 2, childAges: [] }], pageSize: 50, ...patch,
});

describe('hotel search & merge (INVT-4)', () => {
  it('anonymous storefront search merges extranet, TBO and Hotelbeds offers and shows the cheapest first', async () => {
    const { server } = testServer();
    const out = await server.handle('search.run', await hotelSearch(server, 'CAI'));
    expect(out.audience).toBe('customer');
    expect(out.total).toBeGreaterThan(5);
    const prices = out.items.map((r) => r.cheapest.priceMinor);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const merged = out.items.find((r) => r.sources.length > 1);
    expect(merged, 'a hotel sold by several sources').toBeDefined();
    expect(merged!.productId).not.toBeNull(); // contracted content is the display product
    expect(merged!.options.every((o, i, a) => i === 0 || a[i - 1]!.priceMinor <= o.priceMinor)).toBe(true);
    expect(out.items.flatMap((r) => r.options).every((o) => o.buyMinor === null)).toBe(true); // customers never see buy prices
  });

  it('filters by source group (Extranet / B2B / Global), refundability and stars', async () => {
    const { server } = testServer();
    const global = await server.handle('search.run', await hotelSearch(server, 'CAI', { filters: { sources: ['global'] } }));
    expect(global.items.flatMap((r) => r.options).every((o) => o.ownership === 'api')).toBe(true);
    const refundable = await server.handle('search.run', await hotelSearch(server, 'CAI', { filters: { refundableOnly: true } }));
    expect(refundable.items.flatMap((r) => r.options).every((o) => o.refundable)).toBe(true);
    const five = await server.handle('search.run', await hotelSearch(server, 'CAI', { filters: { minStars: 5 } }));
    expect(five.items.every((r) => (r.stars ?? 0) >= 5)).toBe(true);
  });

  it('respects occupancy, stop-sell and paused products', async () => {
    const { server } = testServer();
    const big = await server.handle('search.run', await hotelSearch(server, 'CAI', { rooms: [{ adults: 3, childAges: [] }], adults: 3 }));
    expect(big.items.flatMap((r) => r.options).every((o) => !/Standard room/.test(o.unitName.en) || o.ownership === 'api')).toBe(true);

    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const nilePearl = (await server.handle('catalog.list', { page: 1, pageSize: 50, q: 'Nile Pearl' }, pharaoh.token)).items[0]!;
    const product = await server.handle('catalog.get', { id: nilePearl.id }, pharaoh.token);
    await server.handle('inventory.bulkUpdate', { productId: product.id, unitIds: product.units.map((u) => u.id), from: '2026-12-02', to: '2026-12-02', weekdays: [], set: { stopSell: true } }, pharaoh.token);
    const after = await server.handle('search.run', await hotelSearch(server, 'CAI'));
    const pearl = after.items.find((r) => r.key === product.id);
    expect(pearl?.options.every((o) => o.ownership === 'api') ?? true).toBe(true); // extranet closed; API offers may remain

    await server.handle('catalog.setStatus', { id: product.id, status: 'paused' }, pharaoh.token);
    const paused = await server.handle('search.run', await hotelSearch(server, 'CAI', { filters: { sources: ['b2b'] } }));
    expect(paused.items.some((r) => r.key === product.id)).toBe(false);
  });
});

describe('who sees what', () => {
  it('agencies see their own contracted stock with cost; other agencies do not; sub-agencies buy at the parent B2B price', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const alnoor = await login(server, 'owner@alnoor.demo');
    const delta = await login(server, 'owner@deltagate.demo');
    const input = await hotelSearch(server, 'GIZ');
    const nileOut = await server.handle('search.run', input, nile.token);
    const golden = nileOut.items.find((r) => r.name.en === 'Golden Pyramids Hotel')!;
    expect(golden).toBeDefined();
    expect(golden.cheapest.ownership).toBe('agency_own');
    expect(golden.cheapest.buyMinor).toBeLessThan(golden.cheapest.priceMinor);
    expect((await server.handle('search.run', input, alnoor.token)).items.some((r) => r.name.en === 'Golden Pyramids Hotel')).toBe(false);
    const deltaGolden = (await server.handle('search.run', input, delta.token)).items.find((r) => r.name.en === 'Golden Pyramids Hotel')!;
    expect(deltaGolden.cheapest.buyMinor).toBeGreaterThan(golden.cheapest.buyMinor!); // agency markup is inside the sub-agency's buy price
  });

  it('suppliers cannot search the sales catalog; suspended suppliers disappear from results', async () => {
    const { server } = testServer();
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    await expect(server.handle('search.run', await hotelSearch(server, 'CAI'), pharaoh.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const admin = await login(server, 'admin@travelta.demo');
    await server.handle('orgs.setStatus', { id: pharaoh.organization.id, status: 'suspended', reason: 'audit' }, admin.token);
    const out = await server.handle('search.run', await hotelSearch(server, 'LXR', { filters: { sources: ['b2b'] } }));
    expect(out.total).toBe(0);
  });
});

describe('all seven services return priced offers', () => {
  it.each([
    ['tour', 'LXR', {}],
    ['activity', 'DXB', {}],
    ['activity', 'HRG', {}],
    ['transfer', 'HRG', {}],
    ['visa', 'DXB', {}],
    ['umrah', 'MKX', { from: '2026-12-01' }],
  ] as const)('%s in %s', async (serviceType, code, patch) => {
    const { server } = testServer();
    const out = await server.handle('search.run', { serviceType, destinationId: await destId(server, code), from: '2026-12-01', adults: 2, children: 1, infants: 0, ...patch });
    expect(out.total).toBeGreaterThan(0);
    expect(out.items[0]!.cheapest.priceMinor).toBeGreaterThan(0);
  });

  it('flights CAI → DXB combine manual ticketing (SkyBridge) and TBO fares, priced per passenger', async () => {
    const { server } = testServer();
    const out = await server.handle('search.run', { serviceType: 'flight', fromCode: 'CAI', toCode: 'DXB', from: '2026-12-01', adults: 2, children: 0, infants: 1 });
    expect(new Set(out.items.map((r) => r.cheapest.source))).toEqual(new Set(['extranet', 'tbo']));
    expect(out.items.every((r) => r.cheapest.quantity === 2)).toBe(true);
  });

  it('Umrah departs on the package weekday and covers Makkah + Madinah nights', async () => {
    const { server } = testServer();
    const out = await server.handle('search.run', { serviceType: 'umrah', destinationId: await destId(server, 'MKX'), from: '2026-12-01', adults: 2, children: 0, infants: 0, pageSize: 50 });
    const r = out.items.find((x) => x.name.en.startsWith('Economy'))!;
    expect(r.cheapest.nights).toBe(10);
  });
});

describe('offer details (recheck)', () => {
  it('re-derives the same price from the offer id, redacted for the viewer, and rejects tampered ids', async () => {
    const { server } = testServer();
    const out = await server.handle('search.run', await hotelSearch(server, 'LXR'));
    const option = out.items[0]!.cheapest;
    const detail = await server.handle('search.offer', { offerId: option.offerId });
    expect(detail.option.priceMinor).toBe(option.priceMinor);
    expect(detail.breakdown.lines.map((l) => l.key)).not.toContain('net');
    await expect(server.handle('search.offer', { offerId: 'not-an-offer' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(server.handle('search.offer', { offerId: option.offerId.replace(/~2026-12-04~/, '~2026-12-01~') })).rejects.toMatchObject({ code: 'SOLD_OUT' });
  });

  it('platform staff see the full waterfall for the same offer', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const out = await server.handle('search.run', await hotelSearch(server, 'LXR'), admin.token);
    const detail = await server.handle('search.offer', { offerId: out.items[0]!.cheapest.offerId }, admin.token);
    expect(detail.breakdown.lines.map((l) => l.key)).toContain('net');
  });
});
