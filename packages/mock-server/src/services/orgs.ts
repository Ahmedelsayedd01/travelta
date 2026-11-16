import { ROLE_TEMPLATES, type RoleTemplateKey } from '@travelta/contracts';
import type { OrganizationEntity, RoleEntity } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../context';

export const ROLE_NAMES: Record<RoleTemplateKey, { en: string; ar: string }> = {
  super_admin: { en: 'Super admin', ar: 'مدير عام' },
  compliance_ops: { en: 'Compliance & operations', ar: 'الامتثال والعمليات' },
  agency_owner: { en: 'Agency owner', ar: 'مالك الوكالة' },
  sales_agent: { en: 'Sales agent', ar: 'مندوب مبيعات' },
  operations: { en: 'Operations', ar: 'العمليات' },
  accountant: { en: 'Accountant', ar: 'محاسب' },
  sub_agent_owner: { en: 'Sub-agency owner', ar: 'مالك الوكالة الفرعية' },
  supplier_admin: { en: 'Supplier admin', ar: 'مدير المورّد' },
  supplier_staff: { en: 'Supplier staff', ar: 'موظف المورّد' },
};

/** The system role templates every organization of a given type starts with. */
export function templatesForOrg(org: Pick<OrganizationEntity, 'type' | 'parentId'>): RoleTemplateKey[] {
  if (org.type === 'platform') return ['super_admin', 'compliance_ops'];
  if (org.type === 'supplier') return ['supplier_admin', 'supplier_staff'];
  if (org.parentId) return ['sub_agent_owner', 'sales_agent'];
  return ['agency_owner', 'sales_agent', 'operations', 'accountant'];
}

export function createSystemRoles(ctx: RequestContext, org: OrganizationEntity): Record<RoleTemplateKey, RoleEntity> {
  const now = ctx.clock.nowIso();
  const out = {} as Record<RoleTemplateKey, RoleEntity>;
  for (const template of templatesForOrg(org)) {
    out[template] = ctx.db.insert('roles', {
      id: createId('role', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: org.id, key: template,
      name: ROLE_NAMES[template], isSystem: true, template, permissions: [...ROLE_TEMPLATES[template].permissions],
    });
  }
  return out;
}
