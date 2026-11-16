import type { ProductInput } from '@travelta/schemas';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './seed/identity';
import { checkoutCart, findOffer, firstCustomer } from './test-flows';
import { testServer } from './test-utils';

type Server = ReturnType<typeof testServer>['server'];
const login = (server: Server, email: string) => server.handle('auth.login', { email, password: DEMO_PASSWORD, audience: 'staff' });
const all = { page: 1, pageSize: 100 };

async function setup() {
  const { server } = testServer();
  const admin = await login(server, 'admin@travelta.demo');
  const orgs = await server.handle('orgs.list', all, admin.token);
  const pharaoh = orgs.items.find((o) => o.slug === 'pharaoh-stays')!;
  const luxor = (await server.handle('reference.destinations', { ...all, q: 'LXR' })).items.find((d) => d.code === 'LXR')!;
  const hotel = (status: ProductInput['status'] = 'live'): ProductInput => ({
    source: 'extranet', supplier: { kind: 'network', id: pharaoh.id }, ownerTenantId: pharaoh.id,
    name: { en: 'Admin Karnak Palace', ar: 'قصر الكرنك' }, description: { en: 'Created by the platform', ar: 'أنشأته المنصة' }, destinationId: luxor.id,
    currency: 'EGP', status, seasons: [],
    details: { serviceType: 'hotel', stars: 5, address: 'Karnak St.', amenities: ['wifi', 'pool'], checkIn: '14:00', checkOut: '12:00', geo: { lat: 25.7150, lng: 32.6520 }, neighborhood: 'East Bank' },
    units: [{ id: 'unit_admin_1', name: { en: 'Nile room', ar: 'غرفة نيلية' }, baseNetMinor: 300_000, childNetMinor: null, weekendUpliftPct: 0, defaultAllotment: 6, minStay: 1,
      policy: { nonRefundable: false, rules: [{ daysBefore: 0, feeType: 'percent', value: 100 }] }, mealPlan: 'BB', maxAdults: 2, maxChildren: 1, times: [], weekdays: [] }],
  });
  const search = () => server.handle('search.run', { serviceType: 'hotel', destinationId: luxor.id, from: '2026-12-20', to: '2026-12-23', adults: 2, children: 0, infants: 0, pageSize: 50 });
  return { server, admin, pharaoh, luxor, hotel, search };
}

describe('platform admin catalog CRUD (scenario A)', () => {
  it('creates a hotel for a supplier, edits it, deactivates/reactivates it in public search and archives it', async () => {
    const { server, admin, pharaoh, hotel, search } = await setup();
    const created = await server.handle('catalog.save', hotel(), admin.token);
    expect(created.ownerTenantId).toBe(pharaoh.id);
    expect((await search()).items.some((r) => r.productId === created.id)).toBe(true);

    // Edit: name, extra room type, coordinates.
    const edited = await server.handle('catalog.save', { ...hotel(), id: created.id, name: { en: 'Admin Karnak Palace & Spa', ar: 'قصر الكرنك والسبا' },
      units: [...hotel().units, { ...hotel().units[0]!, id: 'unit_admin_2', name: { en: 'Suite', ar: 'جناح' }, baseNetMinor: 520_000 }] }, admin.token);
    expect(edited.units).toHaveLength(2);
    expect(edited.version).toBe(2);

    // Availability update by the platform.
    const upd = await server.handle('inventory.bulkUpdate', { productId: created.id, unitIds: ['unit_admin_1'], from: '2026-12-01', to: '2026-12-31', weekdays: [], set: { allotment: 3 } }, admin.token);
    expect(upd.updatedDays).toBe(31);

    await server.handle('catalog.setStatus', { id: created.id, status: 'paused' }, admin.token);
    expect((await search()).items.some((r) => r.productId === created.id)).toBe(false);
    await server.handle('catalog.setStatus', { id: created.id, status: 'live' }, admin.token);
    const back = (await search()).items.find((r) => r.productId === created.id)!;
    expect(back.name.en).toBe('Admin Karnak Palace & Spa');
    expect(back.geo).toEqual({ lat: 25.715, lng: 32.652 });

    await server.handle('catalog.setStatus', { id: created.id, status: 'archived' }, admin.token);
    expect((await search()).items.some((r) => r.productId === created.id)).toBe(false);
    await expect(server.handle('catalog.save', { ...hotel(), id: created.id }, admin.token)).rejects.toMatchObject({ code: 'CONFLICT' });

    // The owner sees the product the platform created; the audit trail names both changes.
    const sup = await login(server, 'supplier@pharaohstays.demo');
    expect((await server.handle('catalog.get', { id: created.id }, sup.token)).status).toBe('archived');
    const auditRows = await server.handle('audit.list', { ...all, q: 'catalog' }, admin.token);
    const actions = auditRows.items.filter((a) => a.entityId === created.id).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['catalog.product_created', 'catalog.product_updated', 'catalog.status_changed', 'catalog.product_archived']));
  });

  it('deletes never-booked products but refuses products with bookings (dependency check)', async () => {
    const { server, admin, hotel } = await setup();
    const draft = await server.handle('catalog.save', hotel('draft'), admin.token);
    await expect(server.handle('catalog.delete', { id: draft.id }, admin.token)).resolves.toEqual({ deleted: true });
    await expect(server.handle('catalog.get', { id: draft.id }, admin.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Book the admin-created hotel through an agency, then try to delete it.
    const live = await server.handle('catalog.save', hotel(), admin.token);
    const agency = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, agency.token, { serviceType: 'hotel', destinationId: live.destinationId, from: '2026-12-20', to: '2026-12-23' }, (name, own) => name === 'Admin Karnak Palace' && own === 'network');
    await server.handle('cart.addOffer', { offerId: option.offerId }, agency.token);
    await checkoutCart(server, agency.token, { customerId: await firstCustomer(server, agency.token) });
    await expect(server.handle('catalog.delete', { id: live.id }, admin.token)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(server.handle('catalog.setStatus', { id: live.id, status: 'archived' }, admin.token)).resolves.toMatchObject({ status: 'archived' });
  });

  it('requires an owner, enforces the owner\'s supply rules and rejects coordinates far from the destination', async () => {
    const { server, admin, hotel } = await setup();
    const { ownerTenantId: _drop, ...noOwner } = hotel();
    await expect(server.handle('catalog.save', noOwner, admin.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const visaOrg = (await server.handle('orgs.list', all, admin.token)).items.find((o) => o.type === 'supplier' && !o.serviceTypes.includes('hotel'))!;
    await expect(server.handle('catalog.save', { ...hotel(), ownerTenantId: visaOrg.id, supplier: { kind: 'network', id: visaOrg.id } }, admin.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const cairoCoords = { ...hotel(), details: { ...hotel().details, geo: { lat: 30.04, lng: 31.23 } } as ProductInput['details'] };
    await expect(server.handle('catalog.save', cairoCoords, admin.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps tenants isolated: suppliers and agencies cannot touch other tenants\' products (scenario G)', async () => {
    const { server, admin, hotel } = await setup();
    const created = await server.handle('catalog.save', hotel(), admin.token);
    const agency = await login(server, 'owner@nilehorizon.demo');
    await expect(server.handle('catalog.get', { id: created.id }, agency.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(server.handle('catalog.setStatus', { id: created.id, status: 'paused' }, agency.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(server.handle('catalog.delete', { id: created.id }, agency.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // An agency cannot assign ownership to someone else.
    const own = await server.handle('catalog.save', { ...hotel('draft'), ownerTenantId: created.ownerTenantId, supplier: { kind: 'own', id: agency.organization.id } }, agency.token);
    expect(own.ownerTenantId).toBe(agency.organization.id);
    // Location management is platform-only.
    await expect(server.handle('places.save', { destinationId: created.destinationId, kind: 'attraction', name: { en: 'X', ar: 'س' }, geo: { lat: 25.7, lng: 32.64 }, active: true }, agency.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('locations and maps', () => {
  it('manages destinations and places with validation, dependency checks and public visibility', async () => {
    const { server, admin, luxor } = await setup();
    const dst = await server.handle('destinations.save', { code: 'fay', name: { en: 'Fayoum', ar: 'الفيوم' }, countryIso2: 'EG', kind: 'city', timezone: 'Africa/Cairo', popular: false, geo: { lat: 29.3084, lng: 30.8428 }, zoom: 12, active: true }, admin.token);
    expect(dst.code).toBe('FAY');
    await expect(server.handle('destinations.save', { code: 'FAY', name: { en: 'Dup', ar: 'مكرر' }, countryIso2: 'EG', kind: 'city', timezone: 'Africa/Cairo', popular: false, geo: { lat: 29.3, lng: 30.8 }, zoom: 12, active: true }, admin.token))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    const lake = await server.handle('places.save', { destinationId: dst.id, kind: 'attraction', name: { en: 'Lake Qarun', ar: 'بحيرة قارون' }, geo: { lat: 29.4700, lng: 30.6000 }, active: true }, admin.token);
    // Swapped latitude/longitude is caught.
    await expect(server.handle('places.save', { destinationId: dst.id, kind: 'attraction', name: { en: 'Wrong', ar: 'خطأ' }, geo: { lat: 30.6, lng: 29.47 }, active: true }, admin.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await server.handle('places.list', { destinationId: dst.id })).map((p) => p.id)).toEqual([lake.id]);

    // Deactivated destinations leave public pickers but stay manageable.
    await server.handle('destinations.save', { ...dst, active: false }, admin.token);
    expect((await server.handle('reference.destinations', all)).items.some((d) => d.id === dst.id)).toBe(false);
    expect((await server.handle('reference.destinations', all, admin.token)).items.some((d) => d.id === dst.id)).toBe(true);

    await expect(server.handle('destinations.delete', { id: luxor.id }, admin.token)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(server.handle('destinations.delete', { id: dst.id }, admin.token)).resolves.toEqual({ deleted: true });
    expect(await server.handle('places.list', { destinationId: dst.id })).toEqual([]);
  });

  it('returns hotel positions, distances, a map-area filter and the hotel location card', async () => {
    const { server, luxor, search } = await setup();
    const res = await search();
    expect(res.items.length).toBeGreaterThan(2);
    expect(res.items.every((r) => r.geo !== null && r.distanceKm !== null && r.distanceKm < 8)).toBe(true);
    // Deterministic positions (same search, same coordinates).
    expect((await search()).items.map((r) => r.geo)).toEqual(res.items.map((r) => r.geo));
    const first = res.items[0]!;
    const box = { south: first.geo!.lat - 0.001, north: first.geo!.lat + 0.001, west: first.geo!.lng - 0.001, east: first.geo!.lng + 0.001 };
    const inBox = await server.handle('search.run', { serviceType: 'hotel', destinationId: luxor.id, from: '2026-12-20', to: '2026-12-23', adults: 2, children: 0, infants: 0, filters: { bounds: box } });
    expect(inBox.items.map((r) => r.key)).toContain(first.key);
    expect(inBox.total).toBeLessThan(res.total);
    const byDistance = await server.handle('search.run', { serviceType: 'hotel', destinationId: luxor.id, from: '2026-12-20', to: '2026-12-23', adults: 2, children: 0, infants: 0, sort: 'distance', pageSize: 50 });
    const d = byDistance.items.map((r) => r.distanceKm!);
    expect([...d].sort((a, b) => a - b)).toEqual(d);

    const loc = await server.handle('places.hotelLocation', { destinationId: luxor.id, geo: first.geo, address: 'Corniche', neighborhood: null });
    expect(loc.nearby.some((p) => p.kind === 'airport')).toBe(true);
    expect(loc.nearby.some((p) => p.kind === 'attraction' && p.name.en === 'Luxor Temple')).toBe(true);
    expect(loc.neighborhood).not.toBeNull();
    expect(loc.directionsUrl).toContain('openstreetmap.org/directions');
  });
});
