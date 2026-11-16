import type { ProductInput } from '@travelta/schemas';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './seed/identity';
import { testServer } from './test-utils';

type Server = ReturnType<typeof testServer>['server'];
const login = (server: Server, email: string) => server.handle('auth.login', { email, password: DEMO_PASSWORD, audience: 'staff' });
const all = { page: 1, pageSize: 100 };

async function hotelInput(server: Server, token: string, supplier: ProductInput['supplier'], destinationCode = 'LXR'): Promise<ProductInput> {
  const dest = (await server.handle('reference.destinations', { ...all, q: destinationCode })).items.find((d) => d.code === destinationCode)!;
  void token;
  return {
    source: 'extranet', supplier, name: { en: 'Karnak Nile View', ar: 'كرنك نايل فيو' }, description: { en: 'New hotel', ar: 'فندق جديد' }, destinationId: dest.id,
    currency: 'EGP', status: 'live', seasons: [],
    details: { serviceType: 'hotel', stars: 4, address: 'Corniche', amenities: ['wifi'], checkIn: '14:00', checkOut: '12:00' },
    units: [{ id: 'unit_new_1', name: { en: 'Standard', ar: 'قياسية' }, baseNetMinor: 200_000, childNetMinor: null, weekendUpliftPct: 0, defaultAllotment: 5, minStay: 1,
      policy: { nonRefundable: false, rules: [{ daysBefore: 0, feeType: 'percent', value: 100 }] }, mealPlan: 'BB', maxAdults: 2, maxChildren: 1, times: [], weekdays: [] }],
  };
}

describe('catalog scope', () => {
  it('seeds every service line and lets the platform see the whole catalog', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const page = await server.handle('catalog.list', all, admin.token);
    const byService = page.items.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.serviceType]: (acc[p.serviceType] ?? 0) + 1 }), {});
    expect(byService).toEqual({ hotel: 21, tour: 9, activity: 8, flight: 12, visa: 5, umrah: 6, transfer: 6 });
  });

  it('suppliers and agencies only see their own products', async () => {
    const { server } = testServer();
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const mine = await server.handle('catalog.list', all, pharaoh.token);
    expect(mine.total).toBe(14);
    expect(mine.items.every((p) => p.ownerName.en === 'Pharaoh Stays Group')).toBe(true);
    const nile = await login(server, 'owner@nilehorizon.demo');
    const nileList = await server.handle('catalog.list', all, nile.token);
    expect(nileList.items.map((p) => p.name.en).sort()).toEqual(['Abu Simbel Sunrise Trip', 'Felucca Aswan–Kom Ombo 2 Days', 'Golden Pyramids Hotel']);
    await expect(server.handle('catalog.get', { id: mine.items[0]!.id }, nile.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('publishing rules', () => {
  it('suppliers publish only in approved service lines (KYC-6)', async () => {
    const { server } = testServer();
    const visaDesk = await login(server, 'supplier@cairovisa.demo');
    const input = await hotelInput(server, visaDesk.token, { kind: 'network', id: visaDesk.organization.id });
    await expect(server.handle('catalog.save', input, visaDesk.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const saved = await server.handle('catalog.save', await hotelInput(server, pharaoh.token, { kind: 'network', id: pharaoh.organization.id }), pharaoh.token);
    expect(saved).toMatchObject({ serviceType: 'hotel', ownerTenantId: pharaoh.organization.id, status: 'live' });
  });

  it('organizations that are not active can save drafts but not go live', async () => {
    const { server } = testServer();
    const sunrise = await login(server, 'owner@sunrise.demo');
    const input = await hotelInput(server, sunrise.token, { kind: 'own', id: sunrise.organization.id });
    await expect(server.handle('catalog.save', input, sunrise.token)).rejects.toMatchObject({ code: 'ORG_NOT_ELIGIBLE' });
    await expect(server.handle('catalog.save', { ...input, status: 'draft' }, sunrise.token)).resolves.toMatchObject({ status: 'draft' });
  });

  it('agencies attach their products to their own suppliers only', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    await expect(server.handle('catalog.save', await hotelInput(server, nile.token, { kind: 'network', id: pharaoh.organization.id }), nile.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const own = (await server.handle('suppliers.list', { ...all, filters: { kind: 'own' } }, nile.token)).items[0]!;
    await expect(server.handle('catalog.save', { ...(await hotelInput(server, nile.token, { kind: 'own', id: own.id })), source: 'manual' }, nile.token)).resolves.toMatchObject({ source: 'manual' });
  });
});

describe('calendar & bulk update (INVT-1, W9)', () => {
  it('applies weekday-filtered bulk changes and reflects them in the calendar', async () => {
    const { server } = testServer();
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const product = await server.handle('catalog.get', { id: (await server.handle('catalog.list', { ...all, q: 'Nile Pearl' }, pharaoh.token)).items[0]!.id }, pharaoh.token);
    const unit = product.units[0]!;
    const before = await server.handle('inventory.calendar', { productId: product.id, unitId: unit.id, from: '2026-11-16', days: 7 }, pharaoh.token);
    expect(before.find((d) => d.date === '2026-11-20')!.netMinor).toBeGreaterThan(before.find((d) => d.date === '2026-11-16')!.netMinor); // Friday uplift
    // Stop-sell Fridays and Saturdays for two weeks; set allotment 2 on all days.
    const r1 = await server.handle('inventory.bulkUpdate', { productId: product.id, unitIds: [unit.id], from: '2026-11-16', to: '2026-11-29', weekdays: [5, 6], set: { stopSell: true } }, pharaoh.token);
    expect(r1.updatedDays).toBe(4);
    await server.handle('inventory.bulkUpdate', { productId: product.id, unitIds: [unit.id], from: '2026-11-16', to: '2026-11-22', weekdays: [], set: { allotment: 2, netMinor: 400_000 } }, pharaoh.token);
    const after = await server.handle('inventory.calendar', { productId: product.id, unitId: unit.id, from: '2026-11-16', days: 7 }, pharaoh.token);
    expect(after.find((d) => d.date === '2026-11-20')).toMatchObject({ stopSell: true, available: 0, allotment: 2, netMinor: 400_000 });
    expect(after.find((d) => d.date === '2026-11-17')).toMatchObject({ stopSell: false, available: 2, netMinor: 400_000, overridden: true });
  });

  it('only the owner edits inventory; ranges are validated', async () => {
    const { server } = testServer();
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    const product = (await server.handle('catalog.list', all, pharaoh.token)).items[0]!;
    const full = await server.handle('catalog.get', { id: product.id }, pharaoh.token);
    const desert = await login(server, 'supplier@desertpulse.demo');
    await expect(server.handle('inventory.bulkUpdate', { productId: product.id, unitIds: [full.units[0]!.id], from: '2026-11-16', to: '2026-11-17', weekdays: [], set: { stopSell: true } }, desert.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(server.handle('inventory.bulkUpdate', { productId: product.id, unitIds: [full.units[0]!.id], from: '2026-11-20', to: '2026-11-17', weekdays: [], set: { stopSell: true } }, pharaoh.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(server.handle('inventory.bulkUpdate', { productId: product.id, unitIds: [full.units[0]!.id], from: '2026-11-16', to: '2026-11-17', weekdays: [], set: {} }, pharaoh.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
