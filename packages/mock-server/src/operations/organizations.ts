import { ROLE_TEMPLATES, permissionsForOrgType, type Permission } from '@travelta/contracts';
import type { AgencySupplierEntity, OrganizationDto, OrganizationEntity, RoleDto, RoleEntity, SupplierDto } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../context';
import { ApiException, forbidden, notFound } from '../errors';
import { listPage } from '../query';
import { assertPermission, requirePrincipal, requireStaff } from '../security';
import { audit } from '../services/audit';
import { assertPlanLimit } from '../services/subscriptions';
import { simHash } from '../services/passwords';
import { DEMO_PASSWORD } from '../seed/identity';
import type { HandlerMap } from './types';

const stamp = (ctx: RequestContext) => {
  const now = ctx.clock.nowIso();
  return { createdAt: now, updatedAt: now, version: 1 };
};
const bump = <T extends { version: number; updatedAt: string }>(ctx: RequestContext, row: T, patch: Partial<T>): T => ({
  ...row, ...patch, version: row.version + 1, updatedAt: ctx.clock.nowIso(),
});

export function toOrgDto(ctx: RequestContext, org: OrganizationEntity): OrganizationDto {
  const parent = org.parentId ? ctx.db.get('organizations', org.parentId) : undefined;
  return {
    id: org.id, type: org.type, parentId: org.parentId, parentName: parent?.name ?? null, name: org.name, legalName: org.legalName,
    slug: org.slug, countryIso2: org.countryIso2, city: org.city, baseCurrency: org.baseCurrency, status: org.status, kycStatus: org.kycStatus,
    serviceTypes: org.serviceTypes, isPlatformRetail: org.isPlatformRetail, contactEmail: org.contactEmail, contactPhone: org.contactPhone,
    memberCount: ctx.db.filter('memberships', (m) => m.tenantId === org.id && m.status === 'active').length, createdAt: org.createdAt,
  };
}

const orgListSpec = {
  search: (o: OrganizationDto) => [o.name.en, o.name.ar, o.slug, o.city, o.legalName],
  sortable: { name: (o: OrganizationDto) => o.name.en, createdAt: (o: OrganizationDto) => o.createdAt, status: (o: OrganizationDto) => o.status },
  defaultSort: 'name:asc' as const,
  filters: {
    type: (o: OrganizationDto, v: string[]) => v.includes(o.type),
    status: (o: OrganizationDto, v: string[]) => v.includes(o.status),
    kycStatus: (o: OrganizationDto, v: string[]) => v.includes(o.kycStatus),
  },
};

function toRoleDto(ctx: RequestContext, role: RoleEntity): RoleDto {
  return {
    id: role.id, key: role.key, name: role.name, isSystem: role.isSystem, permissions: role.permissions,
    memberCount: ctx.db.filter('memberships', (m) => m.roleId === role.id && m.status === 'active').length,
  };
}

/** Custom roles may only contain permissions the org type allows AND the creator holds (no privilege escalation). */
function validateRolePermissions(ctx: RequestContext, permissions: Permission[]) {
  const principal = requireStaff(ctx);
  const scope = new Set(permissionsForOrgType(principal.org.type));
  const outOfScope = permissions.filter((p) => !scope.has(p));
  if (outOfScope.length > 0) throw forbidden(`Not available for this organization type: ${outOfScope.join(', ')}`);
  const notHeld = permissions.filter((p) => !principal.permissions.has(p));
  if (notHeld.length > 0) throw forbidden(`You cannot grant permissions you don't hold: ${notHeld.join(', ')}`);
}

function assertUniqueRoleName(ctx: RequestContext, tenantId: string, name: { en: string }, exceptId?: string) {
  const clash = ctx.db.find('roles', (r) => r.tenantId === tenantId && r.id !== exceptId && r.name.en.trim().toLowerCase() === name.en.trim().toLowerCase());
  if (clash) throw new ApiException('CONFLICT', 'A role with this name already exists', [{ field: 'name.en', issue: 'validation.name_taken' }]);
}

/** Staff user by email, or a new invited one. SIMULATION: the invitation e-mail is previewed, not sent; demo password applies. */
function findOrInviteStaff(ctx: RequestContext, name: string, email: string) {
  const existing = ctx.db.find('users', (u) => u.email === email);
  if (existing && existing.userType !== 'staff') throw new ApiException('CONFLICT', 'This email belongs to a customer account', [{ field: 'email', issue: 'validation.email_taken' }]);
  if (existing) return { user: existing, invited: false };
  const user = ctx.db.insert('users', {
    id: createId('usr', ctx.clock.now()), ...stamp(ctx), email, name, phone: null, locale: 'en', userType: 'staff', status: 'invited',
    passwordHash: simHash(DEMO_PASSWORD, createId('slt', ctx.clock.now()).slice(4, 12)), sellerTenantId: null, lastLoginAt: null, emailVerifiedAt: ctx.clock.nowIso(),
  });
  return { user, invited: true };
}

const canManageRoles = (role: RoleEntity | undefined) => role?.permissions.includes('team.manage_roles') ?? false;

export const organizationHandlers: HandlerMap<
  | 'orgs.list' | 'orgs.get' | 'orgs.setStatus' | 'orgs.update' | 'orgs.myProfile' | 'orgs.updateMyProfile' | 'subAgencies.list' | 'subAgencies.create'
  | 'roles.list' | 'roles.create' | 'roles.update' | 'roles.delete' | 'team.invite' | 'team.updateMember'
  | 'suppliers.list' | 'suppliers.getOwn' | 'suppliers.createOwn' | 'suppliers.updateOwn' | 'contracts.list' | 'contracts.save'
> = {
  // ---- Organizations (platform) ---------------------------------------------------------
  'orgs.list': (ctx, query) => {
    assertPermission(ctx, 'organizations.view');
    return listPage(ctx.db.all('organizations').map((o) => toOrgDto(ctx, o)), query, orgListSpec);
  },

  'orgs.get': (ctx, { id }) => {
    const p = requireStaff(ctx);
    const org = ctx.db.get('organizations', id);
    if (!org) throw notFound('Organization');
    const own = org.id === p.org.id || org.parentId === p.org.id;
    if (!own && !p.permissions.has('organizations.view')) throw notFound('Organization'); // don't leak existence across tenants
    return toOrgDto(ctx, org);
  },

  'orgs.setStatus': (ctx, { id, status, reason }) => {
    assertPermission(ctx, 'organizations.manage');
    const org = ctx.db.get('organizations', id);
    if (!org) throw notFound('Organization');
    if (org.type === 'platform') throw forbidden('The platform organization cannot be suspended');
    if (status === 'active' && org.kycStatus !== 'approved') {
      throw new ApiException('ORG_NOT_ELIGIBLE', 'Only organizations with approved KYC can be activated');
    }
    if (status === 'suspended') {
      // Suspension ends every session in that organization immediately.
      for (const s of ctx.db.filter('sessions', (x) => x.tenantId === id && !x.revokedAt)) ctx.db.replace('sessions', bump(ctx, s, { revokedAt: ctx.clock.nowIso() }));
    }
    const updated = ctx.db.replace('organizations', bump(ctx, org, { status }));
    audit(ctx, { tenantId: org.id, action: `organization.${status === 'active' ? 'reactivated' : 'suspended'}`, entity: 'organization', entityId: org.id, before: { status: org.status }, after: { status, reason } });
    return toOrgDto(ctx, updated);
  },

  'orgs.myProfile': (ctx) => toOrgDto(ctx, requireStaff(ctx).org),

  'orgs.update': (ctx, { id, ...input }) => {
    const { org: actor } = assertPermission(ctx, 'organizations.manage');
    const org = ctx.db.get('organizations', id);
    if (!org) throw notFound('Organization');
    const updated = ctx.db.replace('organizations', bump(ctx, org, input));
    audit(ctx, { tenantId: org.id, action: 'organization.updated_by_platform', entity: 'organization', entityId: org.id,
      before: { name: org.name, legalName: org.legalName, city: org.city, contactEmail: org.contactEmail, contactPhone: org.contactPhone, baseCurrency: org.baseCurrency },
      after: { ...input, by: actor.id } });
    return toOrgDto(ctx, updated);
  },

  'orgs.updateMyProfile': (ctx, input) => {
    const { org } = assertPermission(ctx, 'settings.manage');
    const updated = ctx.db.replace('organizations', bump(ctx, org, input));
    audit(ctx, { tenantId: org.id, action: 'organization.profile_updated', entity: 'organization', entityId: org.id, before: { name: org.name, contactEmail: org.contactEmail }, after: input });
    return toOrgDto(ctx, updated);
  },

  // ---- Sub-agencies (one level, Q16) -------------------------------------------------------
  'subAgencies.list': (ctx, query) => {
    const { org } = assertPermission(ctx, 'sub_agencies.view');
    return listPage(ctx.db.filter('organizations', (o) => o.parentId === org.id).map((o) => toOrgDto(ctx, o)), query, orgListSpec);
  },

  'subAgencies.create': (ctx, input) => {
    const { org: parent } = assertPermission(ctx, 'sub_agencies.manage');
    if (parent.type !== 'agency' || parent.parentId) throw forbidden('Only top-level agencies can create sub-agencies');
    assertPlanLimit(ctx, parent, 'subAgencies');
    const slugBase = input.name.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sub-agency';
    let slug = slugBase;
    for (let i = 2; ctx.db.find('organizations', (o) => o.slug === slug); i++) slug = `${slugBase}-${i}`;
    // Decision: sub-agencies operate under the parent's verified licence, so they start active (documented in BUSINESS_RULES KYC-7).
    const org = ctx.db.insert('organizations', {
      id: createId('org', ctx.clock.now()), ...stamp(ctx), type: 'agency', parentId: parent.id, name: input.name, legalName: input.legalName, slug,
      countryIso2: parent.countryIso2, city: input.city, baseCurrency: parent.baseCurrency, status: 'active', kycStatus: 'approved',
      serviceTypes: [], isPlatformRetail: false, contactEmail: input.contactEmail, contactPhone: input.contactPhone,
    });
    const roles = (['sub_agent_owner', 'sales_agent'] as const).map((template) =>
      ctx.db.insert('roles', {
        id: createId('role', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, key: template,
        name: template === 'sub_agent_owner' ? { en: 'Sub-agency owner', ar: 'مالك الوكالة الفرعية' } : { en: 'Sales agent', ar: 'مندوب مبيعات' },
        isSystem: true, template, permissions: [...ROLE_TEMPLATES[template].permissions],
      }),
    );
    const { user } = findOrInviteStaff(ctx, input.owner.name, input.owner.email);
    ctx.db.insert('memberships', { id: createId('mem', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, userId: user.id, roleId: roles[0]!.id, status: 'active' });
    audit(ctx, { tenantId: parent.id, action: 'sub_agency.created', entity: 'organization', entityId: org.id, after: { name: input.name, owner: input.owner.email } });
    return toOrgDto(ctx, org);
  },

  // ---- Roles ---------------------------------------------------------------------------------
  'roles.list': (ctx) => {
    const { org } = assertPermission(ctx, 'team.view');
    return ctx.db.filter('roles', (r) => r.tenantId === org.id).sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.en.localeCompare(b.name.en)).map((r) => toRoleDto(ctx, r));
  },

  'roles.create': (ctx, input) => {
    const { org } = assertPermission(ctx, 'team.manage_roles');
    validateRolePermissions(ctx, input.permissions);
    assertUniqueRoleName(ctx, org.id, input.name);
    const role = ctx.db.insert('roles', {
      id: createId('role', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, key: `custom_${createId('k', ctx.clock.now()).slice(-6).toLowerCase()}`,
      name: input.name, isSystem: false, template: null, permissions: [...new Set(input.permissions)].sort(),
    });
    audit(ctx, { tenantId: org.id, action: 'role.created', entity: 'role', entityId: role.id, after: { name: role.name, permissions: role.permissions } });
    return toRoleDto(ctx, role);
  },

  'roles.update': (ctx, { id, ...input }) => {
    const { org } = assertPermission(ctx, 'team.manage_roles');
    const role = ctx.db.get('roles', id);
    if (!role || role.tenantId !== org.id) throw notFound('Role');
    if (role.isSystem) throw forbidden('System roles cannot be edited; clone them into a custom role instead');
    validateRolePermissions(ctx, input.permissions);
    assertUniqueRoleName(ctx, org.id, input.name, id);
    const updated = ctx.db.replace('roles', bump(ctx, role, { name: input.name, permissions: [...new Set(input.permissions)].sort() }));
    audit(ctx, { tenantId: org.id, action: 'role.updated', entity: 'role', entityId: id, before: { permissions: role.permissions }, after: { permissions: updated.permissions } });
    return toRoleDto(ctx, updated);
  },

  'roles.delete': (ctx, { id }) => {
    const { org } = assertPermission(ctx, 'team.manage_roles');
    const role = ctx.db.get('roles', id);
    if (!role || role.tenantId !== org.id) throw notFound('Role');
    if (role.isSystem) throw forbidden('System roles cannot be deleted');
    if (ctx.db.find('memberships', (m) => m.roleId === id)) throw new ApiException('CONFLICT', 'Reassign members before deleting this role');
    ctx.db.delete('roles', id);
    audit(ctx, { tenantId: org.id, action: 'role.deleted', entity: 'role', entityId: id, before: { name: role.name } });
    return { ok: true as const };
  },

  // ---- Team ------------------------------------------------------------------------------------
  'team.invite': (ctx, { name, email, roleId }) => {
    const { org } = assertPermission(ctx, 'team.manage_users');
    assertPlanLimit(ctx, org, 'users');
    const role = ctx.db.get('roles', roleId);
    if (!role || role.tenantId !== org.id) throw new ApiException('VALIDATION_ERROR', 'Unknown role', [{ field: 'roleId', issue: 'validation.invalid_value' }]);
    const { user, invited } = findOrInviteStaff(ctx, name, email);
    if (ctx.db.find('memberships', (m) => m.userId === user.id && m.tenantId === org.id)) {
      throw new ApiException('CONFLICT', 'Already a member of this organization', [{ field: 'email', issue: 'validation.already_member' }]);
    }
    ctx.db.insert('memberships', { id: createId('mem', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, userId: user.id, roleId, status: 'active' });
    audit(ctx, { tenantId: org.id, action: 'team.member_invited', entity: 'user', entityId: user.id, after: { email, role: role.key } });
    return { userId: user.id, invited };
  },

  'team.updateMember': (ctx, { userId, roleId, status }) => {
    const p = assertPermission(ctx, 'team.manage_users');
    if (userId === p.user.id) throw new ApiException('CONFLICT', 'You cannot change your own role or status');
    const membership = ctx.db.find('memberships', (m) => m.userId === userId && m.tenantId === p.org.id);
    if (!membership) throw notFound('Member');
    const nextRole = roleId ? ctx.db.get('roles', roleId) : ctx.db.get('roles', membership.roleId);
    if (!nextRole || nextRole.tenantId !== p.org.id) throw new ApiException('VALIDATION_ERROR', 'Unknown role', [{ field: 'roleId', issue: 'validation.invalid_value' }]);
    const nextStatus = status ?? membership.status;
    // Never leave the organization without someone who can manage roles.
    const losesAdmin = canManageRoles(ctx.db.get('roles', membership.roleId)) && (!canManageRoles(nextRole) || nextStatus === 'disabled');
    if (losesAdmin) {
      const otherAdmins = ctx.db.filter('memberships', (m) => m.tenantId === p.org.id && m.userId !== userId && m.status === 'active' && canManageRoles(ctx.db.get('roles', m.roleId)));
      if (otherAdmins.length === 0) throw new ApiException('CONFLICT', 'The organization must keep at least one member who can manage roles');
    }
    ctx.db.replace('memberships', bump(ctx, membership, { roleId: nextRole.id, status: nextStatus }));
    if (nextStatus === 'disabled' || nextRole.id !== membership.roleId) {
      // Changed access takes effect immediately: end that member's sessions in this organization.
      for (const s of ctx.db.filter('sessions', (x) => x.userId === userId && x.tenantId === p.org.id && !x.revokedAt)) ctx.db.replace('sessions', bump(ctx, s, { revokedAt: ctx.clock.nowIso() }));
    }
    audit(ctx, { tenantId: p.org.id, action: 'team.member_updated', entity: 'user', entityId: userId, before: { roleId: membership.roleId, status: membership.status }, after: { roleId: nextRole.id, status: nextStatus } });
    return { ok: true as const };
  },

  // ---- Suppliers & contracts -------------------------------------------------------------------
  'suppliers.list': (ctx, query) => {
    // Read-only picker for anyone who books (manual bookings, CRM quotations); contracts stay behind suppliers.view.
    const p = requirePrincipal(ctx);
    if (!p.permissions.has('suppliers.view') && !p.permissions.has('bookings.create')) throw forbidden('Missing permission: suppliers.view');
    const { org } = p;
    const today = ctx.clock.today();
    const activeContract = (kind: 'network' | 'own', id: string) => !p.permissions.has('suppliers.view') ? null :
      ctx.db.find('supplierContracts', (c) => c.tenantId === org.id && c.supplier.kind === kind && c.supplier.id === id && c.status === 'active' && c.validFrom <= today && c.validTo >= today) ?? null;
    const network: SupplierDto[] = ctx.db.filter('organizations', (o) => o.type === 'supplier').map((o) => ({
      kind: 'network', id: o.id, name: o.name, serviceTypes: o.serviceTypes, city: o.city, currency: o.baseCurrency, status: o.status,
      contact: o.contactEmail, activeContract: org.type === 'platform' ? activeContract('network', o.id) : null,
    }));
    const own: SupplierDto[] = org.type === 'agency'
      ? ctx.db.filter('agencySuppliers', (s) => s.tenantId === org.id).map((s) => ({
          kind: 'own', id: s.id, name: { en: s.name, ar: s.name }, serviceTypes: s.serviceTypes, city: '', currency: s.currency, status: s.status,
          contact: s.email || s.phone, activeContract: activeContract('own', s.id),
        }))
      : [];
    return listPage([...own, ...network], query, {
      search: (s) => [s.name.en, s.name.ar, s.contact],
      sortable: { name: (s) => s.name.en, kind: (s) => s.kind },
      defaultSort: 'name:asc',
      filters: { kind: (s, v) => v.includes(s.kind), service: (s, v) => s.serviceTypes.some((t) => v.includes(t)), status: (s, v) => v.includes(s.status) },
    });
  },

  'suppliers.getOwn': (ctx, { id }) => {
    const { org } = assertPermission(ctx, 'suppliers.view');
    const row = ctx.db.get('agencySuppliers', id);
    if (!row || row.tenantId !== org.id) throw notFound('Supplier');
    return row;
  },

  'suppliers.createOwn': (ctx, input) => {
    const { org } = assertPermission(ctx, 'suppliers.manage');
    if (org.type !== 'agency') throw forbidden('Only agencies keep their own off-platform suppliers');
    const row: AgencySupplierEntity = ctx.db.insert('agencySuppliers', { id: createId('asup', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, ...input });
    audit(ctx, { tenantId: org.id, action: 'supplier.created', entity: 'agency_supplier', entityId: row.id, after: { name: row.name } });
    return row;
  },

  'suppliers.updateOwn': (ctx, { id, ...input }) => {
    const { org } = assertPermission(ctx, 'suppliers.manage');
    const row = ctx.db.get('agencySuppliers', id);
    if (!row || row.tenantId !== org.id) throw notFound('Supplier');
    const updated = ctx.db.replace('agencySuppliers', bump(ctx, row, input));
    audit(ctx, { tenantId: org.id, action: 'supplier.updated', entity: 'agency_supplier', entityId: id, before: { status: row.status }, after: { status: updated.status } });
    return updated;
  },

  'contracts.list': (ctx, { supplierId }) => {
    const { org } = assertPermission(ctx, 'suppliers.view');
    return ctx.db.filter('supplierContracts', (c) => c.tenantId === org.id && (!supplierId || c.supplier.id === supplierId)).sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  },

  'contracts.save': (ctx, { id, ...input }) => {
    const { org } = assertPermission(ctx, 'suppliers.manage');
    // Contracts belong to whoever owns the supply relationship (PRICING_ENGINE §5).
    if (input.supplier.kind === 'network') {
      if (org.type !== 'platform') throw forbidden('Network supplier contracts are managed by the platform');
      if (ctx.db.get('organizations', input.supplier.id)?.type !== 'supplier') throw notFound('Supplier');
    } else {
      const own = ctx.db.get('agencySuppliers', input.supplier.id);
      if (!own || own.tenantId !== org.id) throw notFound('Supplier');
    }
    if (id) {
      const existing = ctx.db.get('supplierContracts', id);
      if (!existing || existing.tenantId !== org.id) throw notFound('Contract');
      const updated = ctx.db.replace('supplierContracts', bump(ctx, existing, { ...input, isDemoValue: false }));
      audit(ctx, { tenantId: org.id, action: 'contract.updated', entity: 'supplier_contract', entityId: id, before: { commissionPct: existing.commissionPct }, after: { commissionPct: input.commissionPct } });
      return updated;
    }
    const row = ctx.db.insert('supplierContracts', { id: createId('ctr', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, ...input, isDemoValue: false });
    audit(ctx, { tenantId: org.id, action: 'contract.created', entity: 'supplier_contract', entityId: row.id, after: { commissionPct: row.commissionPct } });
    return row;
  },
};
