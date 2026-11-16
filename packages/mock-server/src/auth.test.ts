import { ROLE_TEMPLATES, portalForOrgType, type Permission } from '@travelta/contracts';
import { describe, expect, it } from 'vitest';
import type { ApiException } from './errors';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './seed/identity';
import { testServer } from './test-utils';

const PASSWORD = DEMO_PASSWORD;

async function login(server: ReturnType<typeof testServer>['server'], email: string, audience: 'staff' | 'customer' = 'staff') {
  return server.handle('auth.login', { email, password: PASSWORD, audience });
}

describe('auth.login', () => {
  it('signs a staff member into their organization and portal', async () => {
    const { server } = testServer();
    const session = await login(server, 'owner@nilehorizon.demo');
    expect(session.portal).toBe('agency');
    expect(session.organization.name.en).toBe('Nile Horizon Travel');
    expect(session.role?.key).toBe('agency_owner');
    expect(session.token).toMatch(/^tvl_/);
  });

  it('rejects a wrong password or unknown email with the same UNAUTHENTICATED error', async () => {
    const { server } = testServer();
    await expect(server.handle('auth.login', { email: 'owner@nilehorizon.demo', password: 'nope', audience: 'staff' })).rejects.toMatchObject({ code: 'UNAUTHENTICATED', message: 'Email or password is incorrect' });
    await expect(server.handle('auth.login', { email: 'ghost@nowhere.demo', password: PASSWORD, audience: 'staff' })).rejects.toMatchObject({ code: 'UNAUTHENTICATED', message: 'Email or password is incorrect' });
  });

  it('keeps staff out of the customer app and customers out of the portals', async () => {
    const { server } = testServer();
    await expect(login(server, 'owner@nilehorizon.demo', 'customer')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(login(server, 'customer@example.com', 'staff')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const customer = await login(server, 'customer@example.com', 'customer');
    expect(customer.portal).toBe('account');
    expect(customer.permissions).toEqual([]);
    expect(customer.organization.isPlatformRetail).toBe(true);
  });

  it('validates input before checking credentials', async () => {
    const { server } = testServer();
    await expect(server.handle('auth.login', { email: 'not-an-email', password: PASSWORD, audience: 'staff' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('records the login in the audit trail', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const audit = await server.handle('audit.list', { page: 1, pageSize: 20 }, owner.token);
    expect(audit.items.some((a) => a.action === 'auth.login' && a.actorName === 'Ahmed Samir')).toBe(true);
  });
});

describe('sessions', () => {
  it('requires a token for session operations and rejects unknown tokens', async () => {
    const { server } = testServer();
    await expect(server.handle('auth.me', undefined)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(server.handle('auth.me', undefined, 'tvl_forged')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('auth.me returns the same session the login produced', async () => {
    const { server } = testServer();
    const session = await login(server, 'ops@nilehorizon.demo');
    const me = await server.handle('auth.me', undefined, session.token);
    expect(me).toEqual(session);
  });

  it('logout revokes the token', async () => {
    const { server } = testServer();
    const session = await login(server, 'sales@nilehorizon.demo');
    await expect(server.handle('auth.logout', undefined, session.token)).resolves.toEqual({ ok: true });
    await expect(server.handle('auth.me', undefined, session.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('expires after 7 days on the demo clock', async () => {
    const { server } = testServer();
    const session = await login(server, 'sales@nilehorizon.demo');
    await server.handle('demo.setClock', { offsetDays: 6 });
    await expect(server.handle('auth.me', undefined, session.token)).resolves.toBeDefined();
    await server.handle('demo.setClock', { offsetDays: 8 });
    await expect(server.handle('auth.me', undefined, session.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('a demo reset signs everybody out (sessions are part of the dataset)', async () => {
    const { server } = testServer();
    const session = await login(server, 'sales@nilehorizon.demo');
    await server.handle('demo.reset', undefined);
    await expect(server.handle('auth.me', undefined, session.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('auth.registerCustomer', () => {
  const input = { name: 'Laila Hassan', email: 'laila.hassan@example.com', password: 'Travel@2026', locale: 'ar' as const };

  it('creates a Travelta Direct customer and signs them in', async () => {
    const { server } = testServer();
    const session = await server.handle('auth.registerCustomer', input);
    expect(session.portal).toBe('account');
    expect(session.user).toMatchObject({ name: 'Laila Hassan', email: 'laila.hassan@example.com', locale: 'ar', userType: 'customer' });
    expect(session.organization.isPlatformRetail).toBe(true);
    await expect(login(server, input.email, 'customer').catch((e: { code: string }) => e.code)).resolves.toBe('UNAUTHENTICATED'); // demo password isn't theirs
    await expect(server.handle('auth.login', { email: input.email, password: input.password, audience: 'customer' })).resolves.toMatchObject({ portal: 'account' });
  });

  it('rejects duplicates, weak passwords and unknown storefronts', async () => {
    const { server } = testServer();
    await server.handle('auth.registerCustomer', input);
    await expect(server.handle('auth.registerCustomer', input)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(server.handle('auth.registerCustomer', { ...input, email: 'x@example.com', password: 'weak' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(server.handle('auth.registerCustomer', { ...input, email: 'y@example.com', storefront: 'no-such-store' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lets the same email register separately with an agency storefront (customers belong to the seller)', async () => {
    const { server } = testServer();
    await server.handle('auth.registerCustomer', input);
    const agencyCustomer = await server.handle('auth.registerCustomer', { ...input, storefront: 'nile-horizon' });
    expect(agencyCustomer.organization.name.en).toBe('Nile Horizon Travel');
  });

  it('refuses registration on a storefront whose organization is not active (M22: such storefronts are not public)', async () => {
    const { server } = testServer();
    await expect(server.handle('auth.registerCustomer', { ...input, storefront: 'red-sea-journeys' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('auth.switchOrg', () => {
  it('moves the session to another membership and swaps permissions with it', async () => {
    const { server } = testServer();
    const platform = await login(server, 'admin@travelta.demo');
    expect(platform.portal).toBe('admin');
    expect(platform.memberships.map((m) => m.orgName.en).sort()).toEqual(['Travelta', 'Travelta Direct']);
    expect(platform.permissions).toContain('pricing.override_guardrails');

    const direct = platform.memberships.find((m) => m.orgName.en === 'Travelta Direct')!;
    const switched = await server.handle('auth.switchOrg', { tenantId: direct.tenantId }, platform.token);
    expect(switched.organization.name.en).toBe('Travelta Direct');
    expect(switched.portal).toBe('agency');
    expect(switched.role?.key).toBe('agency_owner');
    expect(new Set(switched.permissions)).toEqual(new Set(ROLE_TEMPLATES.agency_owner.permissions));
    expect(switched.permissions).not.toContain('pricing.override_guardrails');

    // The previous token is revoked; the new one works.
    await expect(server.handle('auth.me', undefined, platform.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(server.handle('auth.me', undefined, switched.token)).resolves.toMatchObject({ organization: { name: { en: 'Travelta Direct' } } });
  });

  it('refuses organizations the user does not belong to, and customers', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const admin = await login(server, 'admin@travelta.demo');
    await expect(server.handle('auth.switchOrg', { tenantId: admin.organization.id }, owner.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const customer = await login(server, 'customer@example.com', 'customer');
    await expect(server.handle('auth.switchOrg', { tenantId: owner.organization.id }, customer.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('demo accounts and role templates', () => {
  it('every demo account signs in to the right portal with exactly its role template permissions', async () => {
    const { server } = testServer();
    const accounts = await server.handle('demo.accounts', undefined);
    expect(accounts).toHaveLength(DEMO_ACCOUNTS.length);
    for (const account of accounts) {
      const session = await server.handle('demo.loginAs', { email: account.email, audience: account.audience });
      expect(session.portal, account.email).toBe(account.audience === 'customer' ? 'account' : portalForOrgType[account.orgType]);
      if (account.roleKey === 'customer') {
        expect(session.permissions).toEqual([]);
      } else {
        expect(session.role?.key, account.email).toBe(account.roleKey);
        expect(new Set(session.permissions), account.email).toEqual(new Set<Permission>(ROLE_TEMPLATES[account.roleKey].permissions));
      }
    }
  });

  it('seeds every system role with its template permissions in each organization', async () => {
    const { server } = testServer();
    const snap = await server.handle('demo.export', undefined);
    for (const role of snap.collections.roles as { template: keyof typeof ROLE_TEMPLATES; permissions: string[]; tenantId: string }[]) {
      expect(new Set(role.permissions)).toEqual(new Set(ROLE_TEMPLATES[role.template].permissions));
    }
  });

  it('covers every role template at least once among the demo accounts', () => {
    const roles = new Set(DEMO_ACCOUNTS.map((a) => a.role));
    for (const key of Object.keys(ROLE_TEMPLATES)) {
      if (key === 'supplier_staff') continue; // generated staff accounts cover it
      expect(roles.has(key as never), key).toBe(true);
    }
  });

  it('demo.loginAs only accepts demo accounts', async () => {
    const { server } = testServer();
    await expect(server.handle('demo.loginAs', { email: 'someone@else.demo', audience: 'staff' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('permission enforcement and tenant isolation', () => {
  it('team.members requires team.view', async () => {
    const { server } = testServer();
    const sales = await login(server, 'sales@nilehorizon.demo');
    const error = await server.handle('team.members', { page: 1, pageSize: 20 }, sales.token).then(
      () => null,
      (e: ApiException) => e.toApiError('t'),
    );
    expect(error).toMatchObject({ code: 'FORBIDDEN', httpStatus: 403, message: 'Missing permission: team.view' });
  });

  it('team.members only ever returns the caller’s own organization', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const team = await server.handle('team.members', { page: 1, pageSize: 100 }, owner.token);
    expect(team.total).toBe(11); // 4 named demo staff + 7 generated (EXTRA_STAFF)
    expect(team.items.every((m) => m.email.endsWith('@nilehorizon.demo'))).toBe(true);
    // A filter cannot widen the tenant scope.
    const tried = await server.handle('team.members', { page: 1, pageSize: 100, filters: { tenant: 'anything' } }, owner.token);
    expect(tried.total).toBe(11);

    const delta = await login(server, 'owner@deltagate.demo');
    const deltaTeam = await server.handle('team.members', { page: 1, pageSize: 100 }, delta.token);
    expect(deltaTeam.items.every((m) => m.email.endsWith('@deltagate.demo'))).toBe(true);
  });

  it('audit.list: tenants see their own trail, the platform sees all, roles without audit.view are refused', async () => {
    const { server } = testServer();
    await login(server, 'owner@alnoor.demo');
    const nile = await login(server, 'owner@nilehorizon.demo');
    const nileAudit = await server.handle('audit.list', { page: 1, pageSize: 100 }, nile.token);
    expect(nileAudit.items.every((a) => a.tenantId === nile.organization.id)).toBe(true);

    const admin = await login(server, 'admin@travelta.demo');
    const all = await server.handle('audit.list', { page: 1, pageSize: 100 }, admin.token);
    expect(new Set(all.items.map((a) => a.tenantName.en))).toEqual(new Set(['Al Noor Umrah & Hajj', 'Nile Horizon Travel', 'Travelta']));

    const staff = await server.handle('auth.login', { email: (await server.handle('team.members', { page: 1, pageSize: 100 }, (await login(server, 'supplier@pharaohstays.demo')).token)).items.find((m) => m.role.key === 'supplier_staff')!.email, password: PASSWORD, audience: 'staff' });
    await expect(server.handle('audit.list', { page: 1, pageSize: 20 }, staff.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('customers hold no staff permissions', async () => {
    const { server } = testServer();
    const customer = await login(server, 'customer@example.com', 'customer');
    await expect(server.handle('team.members', { page: 1, pageSize: 20 }, customer.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
