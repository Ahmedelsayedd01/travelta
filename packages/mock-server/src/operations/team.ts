import type { AuditEntryDto, TeamMemberDto } from '@travelta/schemas';
import { listPage } from '../query';
import { assertPermission } from '../security';
import type { HandlerMap } from './types';

export const teamHandlers: HandlerMap<'team.members' | 'audit.list'> = {
  /** Members of the caller's active organization only — the tenant comes from the session, never the input. */
  'team.members': (ctx, query) => {
    const { org } = assertPermission(ctx, 'team.view');
    const rows = ctx.db.filter('memberships', (m) => m.tenantId === org.id).flatMap((m): TeamMemberDto[] => {
      const user = ctx.db.get('users', m.userId);
      const role = ctx.db.get('roles', m.roleId);
      if (!user || !role) return [];
      return [{
        userId: user.id, name: user.name, email: user.email, status: m.status === 'disabled' ? 'disabled' : user.status,
        role: { id: role.id, key: role.key, name: role.name, isSystem: role.isSystem }, lastLoginAt: user.lastLoginAt,
      }];
    });
    return listPage(rows, query, {
      search: (r) => [r.name, r.email, r.role.name.en, r.role.name.ar],
      sortable: { name: (r) => r.name, role: (r) => r.role.name.en, lastLoginAt: (r) => r.lastLoginAt },
      defaultSort: 'name:asc',
      filters: { role: (r, v) => v.includes(r.role.key), status: (r, v) => v.includes(r.status) },
    });
  },

  /**
   * Audit trail (TENANCY §6). Tenants see their own entries; the platform's audit.view covers every tenant (oversight).
   */
  'audit.list': (ctx, query) => {
    const { org } = assertPermission(ctx, 'audit.view');
    const crossTenant = org.type === 'platform';
    const rows = ctx.db.filter('auditLogs', (a) => crossTenant || a.tenantId === org.id).map((a): AuditEntryDto => {
      const tenant = ctx.db.get('organizations', a.tenantId);
      const actor = a.actorUserId ? ctx.db.get('users', a.actorUserId) : undefined;
      return {
        id: a.id, at: a.at, tenantId: a.tenantId, tenantName: tenant?.name ?? { en: '—', ar: '—' }, tenantType: tenant?.type ?? 'agency',
        actorName: actor?.name ?? null, action: a.action, entity: a.entity, entityId: a.entityId,
      };
    });
    return listPage(rows, query, {
      search: (r) => [r.action, r.entity, r.actorName, r.tenantName.en],
      sortable: { at: (r) => r.at, action: (r) => r.action },
      defaultSort: 'at:desc',
      filters: { action: (r, v) => v.includes(r.action), tenant: (r, v) => v.includes(r.tenantId) },
    });
  },
};
