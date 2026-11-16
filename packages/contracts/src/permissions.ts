import type { OrgType } from './enums';

/**
 * Permission catalogue (TENANCY_AND_SECURITY §3). Keys are `module.action`.
 * `scopes` lists which organization types may hold the permission — custom roles can never exceed their org's scope.
 */
export const PERMISSIONS = {
  // Platform administration
  'platform.dashboard': ['platform'],
  'organizations.view': ['platform'],
  'organizations.manage': ['platform'],
  'kyc.review': ['platform'],
  'supplier_connections.manage': ['platform'],
  'commercial_settings.view': ['platform'],
  'commercial_settings.manage': ['platform'],
  'plans.manage': ['platform'],
  /** Destinations, neighbourhoods, attractions, airports and transit points (maps). */
  'locations.manage': ['platform'],
  'audit.view': ['platform', 'agency', 'supplier'],

  // Tenant self-service
  'kyc.view_own': ['agency', 'supplier'],
  'kyc.submit': ['agency', 'supplier'],
  'team.view': ['platform', 'agency', 'supplier'],
  'team.manage_users': ['platform', 'agency', 'supplier'],
  'team.manage_roles': ['platform', 'agency', 'supplier'],
  'settings.manage': ['platform', 'agency', 'supplier'],
  'subscriptions.view': ['platform', 'agency'],
  'subscriptions.manage': ['platform', 'agency'],
  'storefront.view': ['agency'],
  'storefront.manage': ['agency'],
  'sub_agencies.view': ['agency'],
  'sub_agencies.manage': ['agency'],

  // Commerce
  'bookings.view': ['platform', 'agency', 'supplier'],
  'bookings.view_all': ['platform', 'agency', 'supplier'],
  'bookings.create': ['agency'],
  'bookings.update_details': ['platform', 'agency'],
  'bookings.confirm': ['platform', 'agency', 'supplier'],
  'bookings.voucher': ['platform', 'agency'],
  'bookings.cancel': ['platform', 'agency'],
  'bookings.view_cost': ['platform', 'agency'],
  'inventory.view': ['platform', 'agency', 'supplier'],
  'inventory.manage': ['platform', 'agency', 'supplier'],
  'suppliers.view': ['platform', 'agency'],
  'suppliers.manage': ['platform', 'agency'],
  'pricing.view': ['platform', 'agency'],
  'pricing.manage_rules': ['platform', 'agency'],
  'pricing.simulate': ['platform', 'agency'],
  'pricing.override_markup': ['platform', 'agency'],
  'pricing.override_price': ['platform', 'agency'],
  'pricing.override_guardrails': ['platform'],
  'pricing.discount': ['platform', 'agency'],

  // Money
  'payments.view': ['platform', 'agency'],
  'payments.collect': ['platform', 'agency'],
  'payments.refund_request': ['platform', 'agency'],
  'payments.refund_approve': ['platform', 'agency'],
  'wallet.view': ['platform', 'agency'],
  'wallet.top_up_request': ['agency'],
  'wallet.top_up_approve': ['platform', 'agency'],
  'wallet.credit_manage': ['platform', 'agency'],
  'invoices.view': ['platform', 'agency', 'supplier'],
  'invoices.issue': ['platform', 'agency'],
  'invoices.void': ['platform', 'agency'],
  'accounting.view': ['platform', 'agency', 'supplier'],
  'accounting.post_manual_entry': ['platform', 'agency'],
  'accounting.manage_accounts': ['platform', 'agency'],

  // CRM & insight
  'crm.view': ['agency'],
  'crm.manage_own': ['agency'],
  'crm.manage_all': ['agency'],
  'customers.view': ['platform', 'agency'],
  'customers.manage': ['platform', 'agency'],
  'reports.view': ['platform', 'agency', 'supplier'],
  'reports.view_financial': ['platform', 'agency', 'supplier'],
} as const satisfies Record<string, readonly OrgType[]>;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export const permissionModule = (p: Permission): string => p.slice(0, p.indexOf('.'));

export const permissionsForOrgType = (orgType: OrgType): Permission[] =>
  PERMISSION_KEYS.filter((p) => (PERMISSIONS[p] as readonly OrgType[]).includes(orgType));

const all = (orgType: OrgType) => permissionsForOrgType(orgType);
const except = (orgType: OrgType, excluded: Permission[]) => all(orgType).filter((p) => !excluded.includes(p));

/** System role templates seeded for every organization of the matching type (TENANCY §3). Owners can clone them into custom roles. */
export const ROLE_TEMPLATES = {
  super_admin: { orgType: 'platform', permissions: all('platform') },
  compliance_ops: {
    orgType: 'platform',
    permissions: [
      'platform.dashboard', 'organizations.view', 'organizations.manage', 'kyc.review', 'audit.view', 'team.view',
      'bookings.view', 'bookings.view_all', 'bookings.view_cost', 'wallet.view', 'wallet.top_up_approve', 'wallet.credit_manage',
      'suppliers.view', 'inventory.view', 'customers.view', 'reports.view', 'payments.view', 'invoices.view',
    ],
  },
  agency_owner: { orgType: 'agency', permissions: all('agency') },
  sales_agent: {
    orgType: 'agency',
    permissions: [
      'bookings.view', 'bookings.create', 'bookings.update_details', 'bookings.view_cost', 'crm.view', 'crm.manage_own',
      'customers.view', 'customers.manage', 'inventory.view', 'pricing.view', 'payments.view', 'payments.collect',
      'payments.refund_request', 'invoices.view', 'wallet.view', 'kyc.view_own',
    ],
  },
  operations: {
    orgType: 'agency',
    permissions: [
      'bookings.view', 'bookings.view_all', 'bookings.update_details', 'bookings.confirm', 'bookings.voucher', 'bookings.cancel',
      'customers.view', 'inventory.view', 'inventory.manage', 'suppliers.view', 'crm.view', 'kyc.view_own',
    ],
  },
  accountant: {
    orgType: 'agency',
    permissions: [
      'bookings.view', 'bookings.view_all', 'bookings.view_cost', 'payments.view', 'payments.collect', 'payments.refund_request',
      'payments.refund_approve', 'wallet.view', 'wallet.top_up_request', 'invoices.view', 'invoices.issue', 'invoices.void',
      'accounting.view', 'accounting.post_manual_entry', 'accounting.manage_accounts', 'suppliers.view', 'customers.view',
      'reports.view', 'reports.view_financial', 'kyc.view_own',
    ],
  },
  sub_agent_owner: {
    orgType: 'agency',
    permissions: except('agency', ['sub_agencies.view', 'sub_agencies.manage', 'storefront.view', 'storefront.manage', 'wallet.top_up_approve', 'wallet.credit_manage']),
  },
  supplier_admin: { orgType: 'supplier', permissions: all('supplier') },
  supplier_staff: {
    orgType: 'supplier',
    permissions: ['bookings.view', 'bookings.view_all', 'bookings.confirm', 'inventory.view', 'inventory.manage', 'kyc.view_own'],
  },
} as const satisfies Record<string, { orgType: OrgType; permissions: readonly Permission[] }>;

export type RoleTemplateKey = keyof typeof ROLE_TEMPLATES;
export const ROLE_TEMPLATE_KEYS = Object.keys(ROLE_TEMPLATES) as RoleTemplateKey[];

/** Which portal a session lands in. Customers (B2C) have no organization role and use the storefront account area. */
export type Portal = 'admin' | 'agency' | 'supplier' | 'account';
export const portalForOrgType: Record<OrgType, Portal> = { platform: 'admin', agency: 'agency', supplier: 'supplier' };
