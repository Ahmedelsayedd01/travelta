import { dayAvailability, distanceKm, overridesIndex } from '@travelta/domain';
import type { ProductEntity, ProductListItem } from '@travelta/schemas';
import { addDays, createId, eachDate } from '@travelta/shared';
import type { RequestContext } from '../context';
import { ApiException, forbidden, notFound } from '../errors';
import { listPage } from '../query';
import { assertPermission } from '../security';
import { audit } from '../services/audit';
import type { HandlerMap } from './types';

/**
 * Platform sees and manages the whole catalog (on behalf of the owning supplier or agency); suppliers and agencies
 * only their own products (TENANCY §2). Another tenant's product is reported as not found, never as forbidden.
 */
function scoped(ctx: RequestContext, id: string, write = false): ProductEntity {
  const p = assertPermission(ctx, write ? 'inventory.manage' : 'inventory.view');
  const product = ctx.db.get('products', id);
  if (!product) throw notFound('Product');
  if (product.ownerTenantId !== p.org.id && p.org.type !== 'platform') throw notFound('Product');
  return product;
}

/** Going live depends on the owner's eligibility (KYC), whoever performs the change. */
function assertCanGoLive(ctx: RequestContext, status: string, ownerTenantId: string) {
  const owner = ctx.db.get('organizations', ownerTenantId);
  if (status === 'live' && owner?.status !== 'active') {
    throw new ApiException('ORG_NOT_ELIGIBLE', 'Products go live only for organizations with approved, valid documents');
  }
}

function toListItem(ctx: RequestContext, p: ProductEntity): ProductListItem {
  const owner = ctx.db.get('organizations', p.ownerTenantId);
  const dest = ctx.db.get('destinations', p.destinationId);
  return {
    id: p.id, serviceType: p.serviceType, source: p.source, name: p.name, destinationId: p.destinationId, currency: p.currency, rating: p.rating,
    status: p.status, imageSeed: p.imageSeed, updatedAt: p.updatedAt, ownerTenantId: p.ownerTenantId,
    ownerName: owner?.name ?? { en: '—', ar: '—' }, destinationName: dest?.name ?? { en: '—', ar: '—' },
    unitCount: p.units.length, fromNetMinor: Math.min(...p.units.map((u) => u.baseNetMinor)),
  };
}

const geoOf = (d: ProductEntity['details']) => (d.serviceType === 'hotel' ? { geo: d.geo } : {});

export const catalogHandlers: HandlerMap<'catalog.list' | 'catalog.get' | 'catalog.save' | 'catalog.setStatus' | 'catalog.delete' | 'inventory.calendar' | 'inventory.bulkUpdate'> = {
  'catalog.list': (ctx, query) => {
    const { org } = assertPermission(ctx, 'inventory.view');
    const rows = ctx.db.filter('products', (p) => org.type === 'platform' || p.ownerTenantId === org.id).map((p) => toListItem(ctx, p));
    return listPage(rows, query, {
      search: (r) => [r.name.en, r.name.ar, r.destinationName.en, r.destinationName.ar, r.ownerName.en],
      sortable: { name: (r) => r.name.en, updatedAt: (r) => r.updatedAt, rating: (r) => r.rating, price: (r) => r.fromNetMinor },
      defaultSort: 'name:asc',
      filters: {
        service: (r, v) => v.includes(r.serviceType),
        status: (r, v) => v.includes(r.status),
        destination: (r, v) => v.includes(r.destinationId),
        source: (r, v) => v.includes(r.source),
      },
    });
  },

  'catalog.get': (ctx, { id }) => scoped(ctx, id),

  /** Create or update a product. Suppliers: only approved service lines (KYC-6). Agencies: own extranet / own suppliers. */
  'catalog.save': (ctx, { id, ownerTenantId, ...input }) => {
    const p = assertPermission(ctx, 'inventory.manage');
    const serviceType = input.details.serviceType;
    const existing = id ? scoped(ctx, id, true) : undefined;
    // The owner decides which supply rules apply: the product's owner on update, the chosen tenant when the platform creates.
    const ownerId = existing?.ownerTenantId ?? (p.org.type === 'platform' ? ownerTenantId : p.org.id);
    if (!ownerId) throw new ApiException('VALIDATION_ERROR', 'Choose the supplier or agency that owns this product', [{ field: 'ownerTenantId', issue: 'validation.required' }]);
    const org = ctx.db.get('organizations', ownerId);
    if (!org || org.type === 'platform') throw new ApiException('VALIDATION_ERROR', 'Products are owned by a supplier or an agency', [{ field: 'ownerTenantId', issue: 'validation.invalid_value' }]);
    if (org.type === 'supplier') {
      if (!org.serviceTypes.includes(serviceType)) throw forbidden(`The ${serviceType} service line is not approved for this supplier`);
      if (input.supplier.kind !== 'network' || input.supplier.id !== org.id || input.source !== 'extranet') {
        throw new ApiException('VALIDATION_ERROR', 'Supplier products are extranet stock of the supplier itself', [{ field: 'supplier', issue: 'validation.invalid_value' }]);
      }
    } else {
      const ownSupplier = input.supplier.kind === 'own' && (input.supplier.id === org.id || ctx.db.get('agencySuppliers', input.supplier.id)?.tenantId === org.id);
      if (!ownSupplier) throw new ApiException('VALIDATION_ERROR', 'Choose one of the agency\'s own suppliers', [{ field: 'supplier', issue: 'validation.invalid_value' }]);
    }
    const dest = ctx.db.get('destinations', input.destinationId);
    if (!dest) throw new ApiException('VALIDATION_ERROR', 'Unknown destination', [{ field: 'destinationId', issue: 'validation.invalid_value' }]);
    if (input.details.serviceType === 'hotel' && input.details.geo && distanceKm(dest.geo, input.details.geo) > 60) {
      throw new ApiException('VALIDATION_ERROR', `The hotel position is ${distanceKm(dest.geo, input.details.geo)} km from ${dest.name.en}; check latitude and longitude`, [{ field: 'details.geo.lat', issue: 'validation.too_far' }]);
    }
    const unitIds = input.units.map((u) => u.id);
    if (new Set(unitIds).size !== unitIds.length) throw new ApiException('VALIDATION_ERROR', 'Duplicate unit ids', [{ field: 'units', issue: 'validation.invalid_value' }]);
    assertCanGoLive(ctx, input.status, org.id);
    const now = ctx.clock.nowIso();
    if (existing) {
      if (existing.serviceType !== serviceType) throw new ApiException('VALIDATION_ERROR', 'Service type cannot change', [{ field: 'details.serviceType', issue: 'validation.invalid_value' }]);
      if (existing.status === 'archived') throw new ApiException('CONFLICT', 'Restore the archived product before editing it');
      const saved = ctx.db.replace('products', { ...existing, ...input, serviceType, version: existing.version + 1, updatedAt: now });
      audit(ctx, { tenantId: existing.ownerTenantId, action: 'catalog.product_updated', entity: 'product', entityId: existing.id,
        before: { name: existing.name.en, status: existing.status, units: existing.units.length, destinationId: existing.destinationId, ...geoOf(existing.details) },
        after: { name: saved.name.en, status: saved.status, units: saved.units.length, destinationId: saved.destinationId, ...geoOf(saved.details), by: p.org.type } });
      return saved;
    }
    const saved = ctx.db.insert('products', {
      id: createId('prd', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, ownerTenantId: org.id, serviceType, rating: 0, reviews: 0,
      imageSeed: Math.floor(Math.random() * 1000), ...input,
    });
    audit(ctx, { tenantId: org.id, action: 'catalog.product_created', entity: 'product', entityId: saved.id, after: { name: saved.name.en, serviceType, status: saved.status, by: p.org.type } });
    return saved;
  },

  'catalog.setStatus': (ctx, { id, status }) => {
    const product = scoped(ctx, id, true);
    assertCanGoLive(ctx, status, product.ownerTenantId);
    const saved = ctx.db.replace('products', { ...product, status, version: product.version + 1, updatedAt: ctx.clock.nowIso() });
    audit(ctx, { tenantId: product.ownerTenantId, action: status === 'archived' ? 'catalog.product_archived' : 'catalog.status_changed', entity: 'product', entityId: id, before: { status: product.status }, after: { status } });
    return saved;
  },

  /** Dependency check: anything booked, quoted or carted keeps its history and can only be archived. */
  'catalog.delete': (ctx, { id }) => {
    const product = scoped(ctx, id, true);
    const booked = ctx.db.filter('bookingItems', (i) => i.productId === id).length;
    const sold = ctx.db.filter('calendarOverrides', (o) => o.productId === id && o.sold > 0).length;
    if (booked + sold > 0) {
      throw new ApiException('CONFLICT', `This product has ${booked} booking items — archive it instead of deleting`, [{ field: 'id', issue: 'validation.in_use' }]);
    }
    for (const o of ctx.db.filter('calendarOverrides', (x) => x.productId === id)) ctx.db.delete('calendarOverrides', o.id);
    ctx.db.delete('products', id);
    audit(ctx, { tenantId: product.ownerTenantId, action: 'catalog.product_deleted', entity: 'product', entityId: id, before: { name: product.name.en, serviceType: product.serviceType, status: product.status } });
    return { deleted: true as const };
  },

  'inventory.calendar': (ctx, { productId, unitId, from, days }) => {
    const product = scoped(ctx, productId);
    const unit = product.units.find((u) => u.id === unitId);
    if (!unit) throw notFound('Rate unit');
    const to = addDays(from, days);
    const lookup = overridesIndex(ctx.db.filter('calendarOverrides', (o) => o.productId === productId && o.unitId === unitId && o.date >= from && o.date < to));
    return eachDate(from, to).map((d) => dayAvailability(product, unit, d, lookup));
  },

  /** Bulk edit by date range and weekdays (W9) — replaces v1's twelve month-by-month update routes. */
  'inventory.bulkUpdate': (ctx, { productId, unitIds, from, to, weekdays, set }) => {
    const product = scoped(ctx, productId, true);
    for (const u of unitIds) if (!product.units.some((x) => x.id === u)) throw notFound('Rate unit');
    const dates = eachDate(from, addDays(to, 1)).filter((d) => weekdays.length === 0 || weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay()));
    const now = ctx.clock.nowIso();
    let updated = 0;
    for (const unitId of unitIds) {
      for (const date of dates) {
        const existing = ctx.db.find('calendarOverrides', (o) => o.productId === productId && o.unitId === unitId && o.date === date);
        const patch = {
          ...(set.allotment !== undefined ? { allotment: set.allotment } : {}),
          ...(set.stopSell !== undefined ? { stopSell: set.stopSell } : {}),
          ...(set.netMinor !== undefined ? { netMinor: set.netMinor } : {}),
        };
        if (existing) {
          if (patch.allotment !== undefined && patch.allotment < existing.sold) {
            throw new ApiException('CONFLICT', `Allotment below units already sold on ${date}`, [{ field: 'set.allotment', issue: 'validation.below_sold' }]);
          }
          ctx.db.replace('calendarOverrides', { ...existing, ...patch, version: existing.version + 1, updatedAt: now });
        } else {
          ctx.db.insert('calendarOverrides', {
            id: createId('cal', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, productId, unitId, date,
            allotment: patch.allotment ?? null, sold: 0, stopSell: patch.stopSell ?? false, netMinor: patch.netMinor ?? null,
          });
        }
        updated++;
      }
    }
    audit(ctx, { tenantId: product.ownerTenantId, action: 'inventory.bulk_updated', entity: 'product', entityId: productId, after: { from, to, weekdays, set, units: unitIds.length } });
    return { updatedDays: updated };
  },
};
