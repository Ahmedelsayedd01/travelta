import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './seed/identity';
import { testServer } from './test-utils';
import { destId, findOffer } from './test-flows';

type Server = ReturnType<typeof testServer>['server'];
const login = (server: Server, email: string) => server.handle('auth.login', { email, password: DEMO_PASSWORD, audience: 'staff' });
const page = { page: 1, pageSize: 100 };

describe('organizations (platform)', () => {
  it('lists every organization for the platform with filters, and refuses agencies', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const suppliers = await server.handle('orgs.list', { ...page, filters: { type: 'supplier' } }, admin.token);
    expect(suppliers.total).toBe(6);
    const owner = await login(server, 'owner@nilehorizon.demo');
    await expect(server.handle('orgs.list', page, owner.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('suspends an organization, ends its sessions, and only reactivates with approved KYC', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const owner = await login(server, 'owner@nilehorizon.demo');
    const suspended = await server.handle('orgs.setStatus', { id: owner.organization.id, status: 'suspended', reason: 'Chargeback investigation' }, admin.token);
    expect(suspended.status).toBe('suspended');
    await expect(server.handle('auth.me', undefined, owner.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(server.handle('orgs.setStatus', { id: owner.organization.id, status: 'active', reason: 'Resolved' }, admin.token)).resolves.toMatchObject({ status: 'active' });

    const redSea = (await server.handle('orgs.list', { ...page, q: 'Red Sea' }, admin.token)).items[0]!;
    await expect(server.handle('orgs.setStatus', { id: redSea.id, status: 'active', reason: 'Skip KYC' }, admin.token)).rejects.toMatchObject({ code: 'ORG_NOT_ELIGIBLE' });
    await expect(server.handle('orgs.setStatus', { id: admin.organization.id, status: 'suspended', reason: 'x' }, admin.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('hides other tenants from orgs.get (NOT_FOUND, not FORBIDDEN)', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const alnoor = await login(server, 'owner@alnoor.demo');
    await expect(server.handle('orgs.get', { id: alnoor.organization.id }, nile.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(server.handle('orgs.get', { id: nile.organization.id }, nile.token)).resolves.toMatchObject({ name: { en: 'Nile Horizon Travel' } });
  });

  it('updates its own profile with settings.manage only', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const profile = await server.handle('orgs.myProfile', undefined, owner.token);
    const updated = await server.handle('orgs.updateMyProfile', { ...profile, city: 'New Cairo', contactPhone: '+20225559999' }, owner.token);
    expect(updated.city).toBe('New Cairo');
    const sales = await login(server, 'sales@nilehorizon.demo');
    await expect(server.handle('orgs.updateMyProfile', { ...profile, city: 'X City' }, sales.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('sub-agencies', () => {
  const input = {
    name: { en: 'Canal Coast Travel', ar: 'كانال كوست للسياحة' }, legalName: 'Canal Coast Travel', city: 'Ismailia',
    contactEmail: 'hello@canalcoast.demo', contactPhone: '+20643330000', owner: { name: 'Hassan Wael', email: 'owner@canalcoast.demo' },
  };

  it('creates a sub-agency with system roles and an invited owner who can sign in', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const created = await server.handle('subAgencies.create', input, owner.token);
    expect(created).toMatchObject({ parentId: owner.organization.id, status: 'active', memberCount: 1 });
    const list = await server.handle('subAgencies.list', page, owner.token);
    expect(list.items.map((o) => o.name.en).sort()).toEqual(['Canal Coast Travel', 'Delta Gate Travel']);
    const newOwner = await login(server, 'owner@canalcoast.demo');
    expect(newOwner.role?.key).toBe('sub_agent_owner');
    expect(newOwner.organization.parentId).toBe(owner.organization.id);
  });

  it('allows only one level of sub-agencies (Q16)', async () => {
    const { server } = testServer();
    const delta = await login(server, 'owner@deltagate.demo');
    await expect(server.handle('subAgencies.create', input, delta.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('roles', () => {
  it('creates, edits and deletes custom roles within the creator’s own permissions', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const role = await server.handle('roles.create', { name: { en: 'Junior sales', ar: 'مبيعات مبتدئ' }, permissions: ['bookings.view', 'crm.view'] }, owner.token);
    expect(role).toMatchObject({ isSystem: false, memberCount: 0 });
    const edited = await server.handle('roles.update', { id: role.id, name: role.name, permissions: ['bookings.view', 'crm.view', 'crm.manage_own'] }, owner.token);
    expect(edited.permissions).toEqual(['bookings.view', 'crm.manage_own', 'crm.view']);
    await expect(server.handle('roles.create', { name: { en: 'junior SALES', ar: 'x' }, permissions: ['crm.view'] }, owner.token)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(server.handle('roles.delete', { id: role.id }, owner.token)).resolves.toEqual({ ok: true });
  });

  it('blocks privilege escalation, out-of-scope permissions and system-role edits', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    await expect(server.handle('roles.create', { name: { en: 'Sneaky', ar: 'x' }, permissions: ['kyc.review'] }, owner.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const roles = await server.handle('roles.list', undefined, owner.token);
    const ownerRole = roles.find((r) => r.key === 'agency_owner')!;
    await expect(server.handle('roles.update', { id: ownerRole.id, name: ownerRole.name, permissions: ['bookings.view'] }, owner.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(server.handle('roles.delete', { id: ownerRole.id }, owner.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // A sub-agency owner can't grant permissions their own role lacks (e.g. sub_agencies.manage).
    const delta = await login(server, 'owner@deltagate.demo');
    await expect(server.handle('roles.create', { name: { en: 'Up', ar: 'x' }, permissions: ['sub_agencies.manage'] }, delta.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses to delete a role that still has members', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const role = await server.handle('roles.create', { name: { en: 'Visa desk', ar: 'مكتب التأشيرات' }, permissions: ['bookings.view'] }, owner.token);
    await server.handle('team.invite', { name: 'New Agent', email: 'new.agent@nilehorizon.demo', roleId: role.id }, owner.token);
    await expect(server.handle('roles.delete', { id: role.id }, owner.token)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('team management', () => {
  it('invites a new member who can sign in with that role, and adds existing staff as a second membership', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const roles = await server.handle('roles.list', undefined, owner.token);
    const ops = roles.find((r) => r.key === 'operations')!;
    await expect(server.handle('team.invite', { name: 'Rana Said', email: 'rana.said@nilehorizon.demo', roleId: ops.id }, owner.token)).resolves.toMatchObject({ invited: true });
    expect((await login(server, 'rana.said@nilehorizon.demo')).role?.key).toBe('operations');

    // Existing staff of another tenant → extra membership (org switcher), not a new user.
    await expect(server.handle('team.invite', { name: 'Ibrahim', email: 'owner@alnoor.demo', roleId: ops.id }, owner.token)).resolves.toMatchObject({ invited: false });
    expect((await login(server, 'owner@alnoor.demo')).memberships).toHaveLength(2);
    await expect(server.handle('team.invite', { name: 'Again', email: 'rana.said@nilehorizon.demo', roleId: ops.id }, owner.token)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(server.handle('team.invite', { name: 'Cust', email: 'customer@example.com', roleId: ops.id }, owner.token)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('changing a role or disabling a member ends their sessions immediately', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const sales = await login(server, 'sales@nilehorizon.demo');
    const roles = await server.handle('roles.list', undefined, owner.token);
    await server.handle('team.updateMember', { userId: sales.user.id, roleId: roles.find((r) => r.key === 'operations')!.id }, owner.token);
    await expect(server.handle('auth.me', undefined, sales.token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect((await login(server, 'sales@nilehorizon.demo')).role?.key).toBe('operations');

    await server.handle('team.updateMember', { userId: sales.user.id, status: 'disabled' }, owner.token);
    await expect(login(server, 'sales@nilehorizon.demo')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('never lets an organization lose its last role manager, nor members edit themselves', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    await expect(server.handle('team.updateMember', { userId: owner.user.id, status: 'disabled' }, owner.token)).rejects.toMatchObject({ code: 'CONFLICT' });

    const admin = await login(server, 'admin@travelta.demo');
    const compliance = await login(server, 'compliance@travelta.demo');
    // compliance_ops lacks team.manage_users, so they cannot change anybody.
    await expect(server.handle('team.updateMember', { userId: admin.user.id, status: 'disabled' }, compliance.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('suppliers & contracts', () => {
  it('shows the platform its network suppliers with active DEMO contracts', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const list = await server.handle('suppliers.list', page, admin.token);
    expect(list.total).toBe(6);
    expect(list.items.every((s) => s.kind === 'network' && s.activeContract?.isDemoValue)).toBe(true);
    expect(list.items.find((s) => s.name.en === 'Desert Pulse Adventures')?.activeContract?.commissionPct).toBe(12);
  });

  it('agencies manage their own suppliers and contracts but not network contracts', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    const list = await server.handle('suppliers.list', { ...page, filters: { kind: 'own' } }, owner.token);
    expect(list.total).toBe(3);
    const created = await server.handle('suppliers.createOwn', {
      name: 'Siwa Desert Camp', serviceTypes: ['hotel', 'tour'], contactName: 'Camp office', email: 'camp@siwa.demo', phone: '+20462000000', currency: 'EGP', notes: '', status: 'active',
    }, owner.token);
    const contract = await server.handle('contracts.save', {
      supplier: { kind: 'own', id: created.id }, reference: 'NH-SIWA-01', validFrom: '2026-11-01', validTo: '2027-10-31', commissionPct: 7,
      commissionByService: { tour: 5 }, payoutDays: 10, creditTerms: '', status: 'active',
    }, owner.token);
    expect(contract).toMatchObject({ tenantId: owner.organization.id, isDemoValue: false });
    const network = (await server.handle('suppliers.list', { ...page, filters: { kind: 'network' } }, owner.token)).items[0]!;
    await expect(server.handle('contracts.save', { supplier: { kind: 'network', id: network.id }, reference: 'NET-01', validFrom: '2026-11-01', validTo: '2027-01-01', commissionPct: 1, commissionByService: {}, payoutDays: 1, creditTerms: '', status: 'active' }, owner.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(server.handle('contracts.save', { supplier: { kind: 'own', id: created.id }, reference: 'X', validFrom: '2027-01-01', validTo: '2026-01-01', commissionPct: 1, commissionByService: {}, payoutDays: 1, creditTerms: '', status: 'active' }, owner.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps one agency’s own suppliers invisible to another', async () => {
    const { server } = testServer();
    const alnoor = await login(server, 'owner@alnoor.demo');
    const list = await server.handle('suppliers.list', { ...page, filters: { kind: 'own' } }, alnoor.token);
    expect(list.total).toBe(0);
  });

  it('only active agencies can book: suspended, pending-KYC and expired-document agencies are refused (KYC-4/5, TENANCY §74)', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const hotel = { serviceType: 'hotel' as const, destinationId: await destId(server, 'LXR'), from: '2026-12-01', to: '2026-12-04', rooms: [{ adults: 2, childAges: [] }] };
    const addFirstOffer = async (email: string) => {
      const agency = await login(server, email);
      const { option } = await findOffer(server, agency.token, hotel);
      return server.handle('cart.addOffer', { offerId: option.offerId }, agency.token);
    };
    await expect(addFirstOffer('owner@redsea.demo')).rejects.toMatchObject({ code: 'ORG_NOT_ELIGIBLE' }); // pending KYC
    await expect(addFirstOffer('owner@sunrise.demo')).rejects.toMatchObject({ code: 'ORG_NOT_ELIGIBLE' }); // expired documents
    const alNoor = (await server.handle('orgs.list', page, admin.token)).items.find((o) => o.slug === 'al-noor-travel' || o.name.en.toLowerCase().includes('noor'))!;
    expect((await addFirstOffer('owner@alnoor.demo')).items).toHaveLength(1);
    await server.handle('orgs.setStatus', { id: alNoor.id, status: 'suspended', reason: 'Compliance hold' }, admin.token);
    await expect(addFirstOffer('owner@alnoor.demo')).rejects.toMatchObject({ code: 'ORG_NOT_ELIGIBLE' });
    await server.handle('orgs.setStatus', { id: alNoor.id, status: 'active', reason: 'Hold lifted' }, admin.token);
    expect((await addFirstOffer('owner@alnoor.demo')).items.length).toBeGreaterThan(0);
  });
});
