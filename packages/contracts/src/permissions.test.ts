import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_TEMPLATES, ROLE_TEMPLATE_KEYS, type Permission } from './permissions';

describe('role templates', () => {
  it('never grant a permission outside their organization scope', () => {
    for (const key of ROLE_TEMPLATE_KEYS) {
      const { orgType, permissions } = ROLE_TEMPLATES[key];
      for (const p of permissions as readonly Permission[]) {
        expect((PERMISSIONS[p] as readonly string[]).includes(orgType), `${key} → ${p}`).toBe(true);
      }
    }
  });

  it('encode the proposal role boundaries', () => {
    const has = (role: keyof typeof ROLE_TEMPLATES, p: Permission) => (ROLE_TEMPLATES[role].permissions as readonly Permission[]).includes(p);
    expect(has('sales_agent', 'pricing.override_price')).toBe(false); // can't edit cost/prices
    expect(has('sales_agent', 'payments.refund_approve')).toBe(false); // can't approve refunds
    expect(has('accountant', 'bookings.create')).toBe(false); // can't create bookings
    expect(has('compliance_ops', 'plans.manage')).toBe(false); // can't change plans
    expect(has('compliance_ops', 'supplier_connections.manage')).toBe(false); // or API keys
    expect(has('supplier_admin', 'bookings.view_cost')).toBe(false); // suppliers never see sell price
    expect(has('sub_agent_owner', 'sub_agencies.manage')).toBe(false); // one level of sub-agencies (Q16)
    expect(has('super_admin', 'pricing.override_guardrails')).toBe(true);
  });
});
