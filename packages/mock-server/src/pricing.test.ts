import type { SimulateInput } from '@travelta/schemas';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './seed/identity';
import { testServer } from './test-utils';

type Server = ReturnType<typeof testServer>['server'];
const login = (server: Server, email: string) => server.handle('auth.login', { email, password: DEMO_PASSWORD, audience: 'staff' });
const scenario = (patch: Partial<SimulateInput> = {}): SimulateInput => ({
  serviceType: 'hotel', source: 'tbo', ownership: 'api', customerType: 'individual', channel: 'b2b', netAmount: 1000, netCurrency: 'EGP',
  quantity: 1, unitType: 'room_night', targetCurrency: 'EGP', travelDate: '2026-12-20', ...patch,
});
const line = (b: { lines: { key: string; amountMinor: number }[] }, key: string) => b.lines.find((l) => l.key === key)?.amountMinor;

describe('pricing.simulate with seeded DEMO rules', () => {
  it('platform sees the whole waterfall with the agency-targeted platform rule (6%) and the agency hotel rule (12%)', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const nile = await login(server, 'owner@nilehorizon.demo');
    const r = await server.handle('pricing.simulate', scenario({ agencyId: nile.organization.id }), admin.token);
    expect(r.audience).toBe('platform');
    expect(line(r.breakdown, 'net')).toBe(100_000);
    expect(line(r.breakdown, 'platform_markup')).toBe(6_000);
    expect(line(r.breakdown, 'agency_markup')).toBe(12_720);
    expect(r.breakdown.totals).toMatchObject({ preTaxMinor: 118_720, taxMinor: 16_621, customerTotalMinor: 135_341 });
    expect(r.resolution.map((x) => [x.layer, x.ruleName])).toEqual([['platform', 'Nile Horizon — hotels'], ['agency', 'Hotels']]);
  });

  it('other agencies get the platform default (8% on API stock) — rules are per agency', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const alnoor = await login(server, 'owner@alnoor.demo');
    const r = await server.handle('pricing.simulate', scenario({ agencyId: alnoor.organization.id }), admin.token);
    expect(line(r.breakdown, 'platform_markup')).toBe(8_000);
    expect(r.resolution[0]).toMatchObject({ source: 'default' });
  });

  it('agencies see their cost as one buy price — never the supplier net or platform markup (TENANCY §4)', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const r = await server.handle('pricing.simulate', scenario(), nile.token);
    expect(r.audience).toBe('agency');
    expect(r.breakdown.lines.map((l) => l.key)).not.toEqual(expect.arrayContaining(['net', 'platform_markup']));
    expect(line(r.breakdown, 'buy_price')).toBe(106_000);
    expect(r.breakdown.settlement.platformRevenueMinor).toBe(0);
    expect(r.breakdown.totals.customerTotalMinor).toBe(135_341);
    expect(r.resolution[0]).toMatchObject({ layer: 'platform', source: 'hidden', ruleName: null });
  });

  it('a sub-agency books at the agency B2B price and sees only its own markup', async () => {
    const { server } = testServer();
    const delta = await login(server, 'owner@deltagate.demo');
    const r = await server.handle('pricing.simulate', scenario(), delta.token);
    expect(r.audience).toBe('sub_agency');
    expect(r.breakdown.lines.map((l) => l.key)).not.toContain('agency_markup');
    expect(line(r.breakdown, 'buy_price')).toBe(118_720);
    expect(line(r.breakdown, 'sub_agency_markup')).toBe(5_936);
  });

  it('network stock earns the platform its contract commission without changing the price', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const pharaoh = (await server.handle('suppliers.list', { page: 1, pageSize: 20, q: 'Pharaoh' }, admin.token)).items[0]!;
    const r = await server.handle('pricing.simulate', scenario({ ownership: 'network', source: 'extranet', supplierId: pharaoh.id }), admin.token);
    expect(r.breakdown.settlement).toMatchObject({ commissionMinor: 10_000, supplierPayoutMinor: 90_000, commissionBeneficiary: 'platform' });
    expect(line(r.breakdown, 'platform_markup')).toBe(5_000);
  });

  it('applies the Travelta Direct online fee, rounding and a promo code on B2C', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const r = await server.handle('pricing.simulate', scenario({ channel: 'b2c', promoCode: 'welcome10' }), admin.token);
    expect(line(r.breakdown, 'fee')).toBe(5_000);
    expect(line(r.breakdown, 'discount')).toBeLessThan(0);
    expect(r.breakdown.totals.customerTotalMinor % 100).toBe(0);
    await expect(server.handle('pricing.simulate', scenario({ channel: 'b2c', promoCode: 'NOPE' }), admin.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('rules, guardrails, versions and commercial settings', () => {
  it('rejects agency percent markups outside the platform guardrail and versions every edit', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const base = { name: 'Summer hotels', status: 'active' as const, match: { serviceTypes: ['hotel' as const] }, mode: 'percent' as const, priority: 20 };
    await expect(server.handle('pricing.rules.save', { ...base, value: 50 }, nile.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const created = await server.handle('pricing.rules.save', { ...base, value: 15 }, nile.token);
    const edited = await server.handle('pricing.rules.save', { ...base, id: created.id, value: 18 }, nile.token);
    expect(edited).toMatchObject({ ruleVersion: 2, value: 18, isDemoValue: false, layer: 'agency' });
    const versions = await server.handle('pricing.rules.versions', { ruleId: created.id }, nile.token);
    expect(versions.map((v) => [v.ruleVersion, v.snapshot.value])).toEqual([[2, 18], [1, 15]]);
    const sales = await login(server, 'sales@nilehorizon.demo');
    await expect(server.handle('pricing.rules.save', { ...base, value: 10 }, sales.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('changing commercial settings changes prices immediately; agencies cannot set platform values', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const alnoor = await login(server, 'owner@alnoor.demo');
    const s = await server.handle('commercialSettings.get', undefined, admin.token);
    expect(s.isDemoValue).toBe(true);
    await server.handle('commercialSettings.update', { ...s, platformDefaults: { apiPct: 10, networkPct: 5 } }, admin.token);
    const r = await server.handle('pricing.simulate', scenario({ agencyId: alnoor.organization.id }), admin.token);
    expect(line(r.breakdown, 'platform_markup')).toBe(10_000);

    const own = await server.handle('commercialSettings.get', undefined, alnoor.token);
    const saved = await server.handle('commercialSettings.update', { ...own, platformDefaults: { apiPct: 0, networkPct: 0 }, fxBufferPct: 5 }, alnoor.token);
    expect(saved).toMatchObject({ platformDefaults: null, fxBufferPct: 0, isDemoValue: false });
  });

  it('keeps one tenant’s rules, taxes and promo codes private', async () => {
    const { server } = testServer();
    const alnoor = await login(server, 'owner@alnoor.demo');
    const rules = await server.handle('pricing.rules.list', { page: 1, pageSize: 50 }, alnoor.token);
    expect(rules.total).toBe(0);
    expect(await server.handle('promoCodes.list', undefined, alnoor.token)).toEqual([]);
    const nile = await login(server, 'owner@nilehorizon.demo');
    expect((await server.handle('pricing.rules.list', { page: 1, pageSize: 50 }, nile.token)).total).toBe(3);
  });
});
