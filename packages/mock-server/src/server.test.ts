import { describe, expect, it } from 'vitest';
import { MemoryPersistence } from './db/persistence';
import { COLLECTION_NAMES, SCHEMA_VERSION, collectionSchemas } from './db/collections';
import { ApiException } from './errors';
import { buildSeed } from './seed';
import { FIXED_NOW, testServer } from './test-utils';

describe('seed', () => {
  it('is deterministic for the same seed and time', () => {
    expect(JSON.stringify(buildSeed({ now: FIXED_NOW }))).toBe(JSON.stringify(buildSeed({ now: FIXED_NOW })));
    expect(JSON.stringify(buildSeed({ seed: 1, now: FIXED_NOW }))).not.toBe(JSON.stringify(buildSeed({ seed: 2, now: FIXED_NOW })));
  });

  it('produces rows that satisfy every entity schema, with unique ids', () => {
    const snap = buildSeed({ now: FIXED_NOW });
    const ids = new Set<string>();
    for (const name of COLLECTION_NAMES) {
      for (const row of snap.collections[name] ?? []) {
        expect(collectionSchemas[name].safeParse(row).success, `${name}`).toBe(true);
        const id = (row as { id: string }).id;
        expect(ids.has(id), id).toBe(false);
        ids.add(id);
      }
    }
    expect(snap.collections.destinations).toHaveLength(12);
  });
});

describe('MockServer lifecycle', () => {
  it('seeds on first boot, persists, and reloads the same data on the next boot', async () => {
    const { server, persistence } = testServer();
    const first = await server.handle('demo.status', undefined);
    expect(first.counts.currencies).toBe(4);
    expect(persistence.saves).toBeGreaterThan(0);

    const { server: second } = testServer({ persistence });
    expect((await second.handle('demo.status', undefined)).fingerprint).toBe(first.fingerprint);
  });

  it('reset restores the seed exactly (TESTING_STRATEGY journey 15)', async () => {
    const { server } = testServer();
    const seeded = await server.handle('demo.status', undefined);
    await server.handle('demo.setClock', { offsetDays: 30 });
    const reset = await server.handle('demo.reset', undefined);
    expect(reset.fingerprint).toBe(seeded.fingerprint);
    expect(reset.clockOffsetDays).toBe(0);
  });

  it('export → reset → import round-trips to an identical dataset', async () => {
    const { server } = testServer();
    await server.handle('demo.setClock', { offsetDays: 12 });
    const exported = await server.handle('demo.export', undefined);
    const before = await server.handle('demo.status', undefined);
    await server.handle('demo.reset', undefined);
    const after = await server.handle('demo.import', exported);
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.clockOffsetDays).toBe(12);
  });

  it('rejects snapshots with a wrong schema version, unknown collections or invalid rows', async () => {
    const { server } = testServer();
    const good = await server.handle('demo.export', undefined);
    await expect(server.handle('demo.import', { ...good, schemaVersion: 999 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(server.handle('demo.import', { ...good, collections: { ...good.collections, hackers: [] } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const broken = structuredClone(good);
    (broken.collections.currencies![0] as Record<string, unknown>).code = 'GBP';
    await expect(server.handle('demo.import', broken)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // A rejected import leaves the dataset untouched.
    expect((await server.handle('demo.status', undefined)).fingerprint).toBe((await testServer().server.handle('demo.status', undefined)).fingerprint);
  });

  it('rejects snapshots whose references point at missing rows (referential integrity)', async () => {
    const { server } = testServer({ history: true });
    const good = await server.handle('demo.export', undefined);
    const orphan = structuredClone(good);
    (orphan.collections.bookingItems![0] as Record<string, unknown>).bookingId = 'bkg_missing';
    await expect(server.handle('demo.import', orphan)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringContaining('problem') });
    const wrongPlace = structuredClone(good);
    (wrongPlace.collections.places![0] as Record<string, unknown>).destinationId = 'dst_missing';
    await expect(server.handle('demo.import', wrongPlace)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // The unmodified export (history seed with bookings, payments, ledger) passes every reference check.
    await expect(server.handle('demo.import', good)).resolves.toBeDefined();
  });

  it('reseeds and reports when stored data has an outdated schema', async () => {
    const persistence = new MemoryPersistence();
    await persistence.save({ snapshot: { ...buildSeed({ now: FIXED_NOW }), schemaVersion: 0 }, settings: { latency: { minMs: 0, maxMs: 0 }, failureRate: 0 } });
    const reasons: string[] = [];
    const { MockServer } = await import('./server');
    const server = new MockServer({ persistence, realNow: () => FIXED_NOW, persistDebounceMs: 0, onReseed: (r) => reasons.push(r) });
    const status = await server.handle('demo.status', undefined);
    expect(status.schemaVersion).toBe(SCHEMA_VERSION);
    expect(reasons).toHaveLength(1);
  });
});

describe('MockServer request pipeline', () => {
  it('validates inputs and returns the VALIDATION_ERROR envelope', async () => {
    const { server } = testServer();
    await expect(server.handle('reference.destinations', { pageSize: 1000 } as never)).rejects.toBeInstanceOf(ApiException);
    await expect(server.handle('reference.destinations', { pageSize: 1000 } as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('simulates network failures for business operations only', async () => {
    const { server } = testServer();
    await server.handle('demo.setSimulation', { failureRate: 1 });
    await expect(server.handle('reference.currencies', undefined)).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(server.handle('demo.status', undefined)).resolves.toBeDefined();
  });

  it('announces changes only for requests that wrote data (POST reads must not trigger cross-tab reloads)', async () => {
    const { server } = testServer();
    await server.ready();
    const seen: string[] = [];
    server.events.subscribe((e) => { if (e.type === 'db.changed') seen.push(e.operation); });
    const dest = (await server.handle('reference.destinations', { q: 'Luxor', page: 1, pageSize: 5 })).items[0]!;
    await server.handle('search.run', { serviceType: 'hotel', destinationId: dest.id, from: '2026-12-01', to: '2026-12-03', adults: 2, children: 0, infants: 0 });
    await server.handle('pricing.simulate', { serviceType: 'hotel', source: 'extranet', ownership: 'network', lines: [{ amountMinor: 100_000, currency: 'EGP', quantity: 1, unitType: 'per_room_night' }], currency: 'EGP' } as never).catch(() => undefined);
    expect(seen).toEqual([]);
    await server.handle('auth.login', { email: 'admin@travelta.demo', password: 'Demo@1234', audience: 'staff' });
    expect(seen).toEqual(['auth.login']);
    await server.handle('demo.setSimulation', { failureRate: 0 });
    expect(seen).toEqual(['auth.login', 'demo.setSimulation']);
  });

  it('lists destinations with search, filters and pagination', async () => {
    const { server } = testServer();
    const page = await server.handle('reference.destinations', { q: 'مكة', page: 1, pageSize: 20 });
    expect(page.items.map((d) => d.code)).toEqual(['MKX']);
    const sa = await server.handle('reference.destinations', { filters: { country: 'SA' }, page: 1, pageSize: 2 });
    expect(sa.total).toBe(3);
    expect(sa.items).toHaveLength(2);
  });
});

describe('FX (FX-1..3) and the demo clock', () => {
  it('returns DEMO latest rates and derived cross rates', async () => {
    const { server } = testServer();
    const usd = await server.handle('fx.latest', { base: 'USD' });
    expect(usd.find((r) => r.quote === 'EGP')?.rate).toBe(48.5);
    const sar = usd.find((r) => r.quote === 'SAR')!;
    expect(sar.rate).toBeCloseTo(48.5 / 12.93, 6);
    expect(usd.every((r) => r.isDemoValue)).toBe(true);
  });

  it('keeps 91 days of history and follows the shifted clock', async () => {
    const { server } = testServer();
    const history = await server.handle('fx.history', { base: 'USD', quote: 'EGP' });
    expect(history).toHaveLength(91);
    await server.handle('demo.setClock', { offsetDays: -30 });
    const shifted = await server.handle('fx.latest', { base: 'USD' });
    const egp = shifted.find((r) => r.quote === 'EGP')!;
    expect(egp.date).toBe('2026-10-16');
    expect(egp.rate).toBe(history.find((h) => h.date === '2026-10-16')?.rate);
  });
});

describe('seed anchoring', () => {
  it('rebuilds an identical dataset for any reset on the same UTC day', async () => {
    let now = Date.UTC(2026, 10, 15, 1, 0, 0);
    const { server } = testServer({ realNow: () => now });
    const morning = await server.handle('demo.status', undefined);
    now = Date.UTC(2026, 10, 15, 22, 30, 0);
    const evening = await server.handle('demo.reset', undefined);
    expect(evening.fingerprint).toBe(morning.fingerprint);
    now = Date.UTC(2026, 10, 16, 8, 0, 0);
    const nextDay = await server.handle('demo.reset', undefined);
    expect(nextDay.fingerprint).not.toBe(morning.fingerprint);
  });
});
