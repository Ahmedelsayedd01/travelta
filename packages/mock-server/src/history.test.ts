import { describe, expect, it } from 'vitest';
import type { JournalEntryEntity, WalletEntity, WalletTransactionEntity } from '@travelta/schemas';
import { COLLECTION_NAMES, collectionSchemas } from './db/collections';
import { buildSeed } from './seed';
import { login } from './test-flows';
import { FIXED_NOW, testServer } from './test-utils';

/** Seeded history is produced by the real services: it must be deterministic, valid and financially consistent. */
describe('seeded booking history', () => {
  it('is deterministic for any time on the seed day and every row is valid', () => {
    const a = buildSeed({ now: FIXED_NOW });
    expect(JSON.stringify(buildSeed({ now: FIXED_NOW + 5 * 3_600_000 }))).toBe(JSON.stringify(a));
    const c = a.collections as unknown as Record<string, unknown[]>;
    expect(c.bookings!.length).toBeGreaterThan(30);
    for (const name of COLLECTION_NAMES) for (const row of c[name] ?? []) expect(collectionSchemas[name].safeParse(row).success, name).toBe(true);
  });

  it('keeps the books balanced and every wallet equal to its transactions (ACC-1, WAL-6)', () => {
    const c = buildSeed({ now: FIXED_NOW }).collections as unknown as { journalEntries: JournalEntryEntity[]; wallets: WalletEntity[]; walletTransactions: WalletTransactionEntity[] };
    for (const e of c.journalEntries) expect(e.lines.reduce((s, l) => s + l.debitMinor - l.creditMinor, 0), e.memo).toBe(0);
    for (const w of c.wallets) expect(c.walletTransactions.filter((t) => t.walletId === w.id).reduce((s, t) => s + t.amountMinor, 0)).toBe(w.balanceMinor);
  });

  it('feeds dashboards and reports for every portal', async () => {
    const { server } = testServer({ history: true });
    const status1 = await server.handle('demo.status', undefined);
    const nile = await login(server, 'owner@nilehorizon.demo');
    const dash = await server.handle('reports.dashboard', { from: '2026-06-01', to: '2026-11-15' }, nile.token);
    expect(dash.kpis.find((k) => k.key === 'sales')!.value).toBeGreaterThan(0);
    expect(dash.trend.points).toHaveLength(6);
    const profit = await server.handle('reports.run', { report: 'profit', from: '2026-01-01', to: '2026-11-15' }, nile.token);
    expect(profit.rows.length).toBeGreaterThan(0);
    expect(profit.totals.revenue! - profit.totals.cost!).toBe(profit.totals.profit);
    const sales = await login(server, 'sales@nilehorizon.demo');
    await expect(server.handle('reports.run', { report: 'margins' }, sales.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const admin = await login(server, 'admin@travelta.demo');
    const agencies = await server.handle('reports.run', { report: 'agencies', from: '2026-01-01', to: '2026-11-15' }, admin.token);
    expect(agencies.rows[0]!.gmv as number).toBeGreaterThan(0);
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    expect((await server.handle('reports.dashboard', {}, pharaoh.token)).audience).toBe('supplier');
    await expect(server.handle('reports.run', { report: 'sales' }, pharaoh.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // First load equals the seed: a reset returns the same fingerprint.
    expect((await server.handle('demo.reset', undefined)).fingerprint).toBe(status1.fingerprint);
  });
});
