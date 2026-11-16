import type { CustomerEntity, CustomerInput } from '@travelta/schemas';
import { customerInputSchema } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../context';
import { invalid, notFound } from '../errors';
import type { Principal } from '../security';
import { audit } from './audit';

/** Tenants whose customers the caller may see: own org, and a parent agency sees its sub-agencies' customers. */
export function customerTenants(ctx: RequestContext, p: Principal): Set<string> {
  if (p.org.type === 'platform') return new Set(ctx.db.filter('organizations', () => true).map((o) => o.id));
  return new Set([p.org.id, ...ctx.db.filter('organizations', (o) => o.parentId === p.org.id).map((o) => o.id)]);
}

export function getCustomerScoped(ctx: RequestContext, p: Principal, id: string): CustomerEntity {
  const c = ctx.db.get('customers', id);
  if (!c || !customerTenants(ctx, p).has(c.tenantId)) throw notFound('Customer');
  return c;
}

/** Create or update a customer of the caller's organization. Email must be unique per tenant. */
export function saveCustomer(ctx: RequestContext, p: Principal, raw: CustomerInput, tenantId = p.org.id): CustomerEntity {
  const input = customerInputSchema.parse(raw);
  const now = ctx.clock.nowIso();
  if (input.email) {
    const dup = ctx.db.find('customers', (c) => c.tenantId === tenantId && c.email === input.email && c.id !== input.id);
    if (dup) throw invalid([{ field: 'email', issue: 'validation.email_taken' }]);
  }
  if (input.id) {
    const existing = getCustomerScoped(ctx, p, input.id);
    const next: CustomerEntity = { ...existing, ...input, id: existing.id, tenantId: existing.tenantId, updatedAt: now, version: existing.version + 1 };
    ctx.db.replace('customers', next);
    audit(ctx, { tenantId: existing.tenantId, action: 'customer.updated', entity: 'customer', entityId: existing.id, before: existing, after: next });
    return next;
  }
  const row: CustomerEntity = {
    id: createId('cus', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId,
    kind: input.kind, name: input.name, email: input.email, phone: input.phone, nationalityIso2: input.nationalityIso2,
    customerType: input.customerType, userId: null, source: input.source, tags: input.tags, notes: input.notes,
  };
  ctx.db.insert('customers', row);
  audit(ctx, { tenantId, action: 'customer.created', entity: 'customer', entityId: row.id, after: row });
  return row;
}

/** Storefront customers: their customer record at the seller, created on first booking. */
export function customerForUser(ctx: RequestContext, p: Principal): CustomerEntity {
  const existing = ctx.db.find('customers', (c) => c.tenantId === p.org.id && c.userId === p.user.id);
  if (existing) return existing;
  const now = ctx.clock.nowIso();
  const row: CustomerEntity = {
    id: createId('cus', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: p.org.id,
    kind: 'individual', name: p.user.name, email: p.user.email, phone: p.user.phone ?? '', nationalityIso2: null,
    customerType: 'individual', userId: p.user.id, source: 'storefront', tags: [], notes: '',
  };
  ctx.db.insert('customers', row);
  return row;
}
