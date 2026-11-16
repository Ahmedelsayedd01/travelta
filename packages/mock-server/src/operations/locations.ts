import { distanceKm, nearest } from '@travelta/domain';
import { createId } from '@travelta/shared';
import { ApiException, notFound } from '../errors';
import { assertPermission } from '../security';
import { audit } from '../services/audit';
import type { HandlerMap } from './types';

/** Places of each kind returned around a hotel. */
const NEARBY_PER_KIND = { attraction: 4, airport: 2, transit: 2, neighborhood: 2 } as const;

export const locationHandlers: HandlerMap<'destinations.save' | 'destinations.delete' | 'places.list' | 'places.save' | 'places.delete' | 'places.hotelLocation'> = {
  'destinations.save': (ctx, { id, ...input }) => {
    const { org } = assertPermission(ctx, 'locations.manage');
    if (!ctx.db.find('countries', (c) => c.iso2 === input.countryIso2)) {
      throw new ApiException('VALIDATION_ERROR', 'Unknown country', [{ field: 'countryIso2', issue: 'validation.invalid_value' }]);
    }
    const clash = ctx.db.find('destinations', (d) => d.code === input.code && d.id !== id);
    if (clash) throw new ApiException('CONFLICT', `Destination code ${input.code} is already used`, [{ field: 'code', issue: 'validation.duplicate' }]);
    const now = ctx.clock.nowIso();
    if (id) {
      const existing = ctx.db.get('destinations', id);
      if (!existing) throw notFound('Destination');
      const saved = ctx.db.replace('destinations', { ...existing, ...input, version: existing.version + 1, updatedAt: now });
      audit(ctx, { tenantId: org.id, action: 'locations.destination_updated', entity: 'destination', entityId: id,
        before: { code: existing.code, name: existing.name.en, geo: existing.geo, active: existing.active, popular: existing.popular },
        after: { code: saved.code, name: saved.name.en, geo: saved.geo, active: saved.active, popular: saved.popular } });
      return saved;
    }
    const saved = ctx.db.insert('destinations', { id: createId('dst', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, ...input });
    audit(ctx, { tenantId: org.id, action: 'locations.destination_created', entity: 'destination', entityId: saved.id, after: { code: saved.code, name: saved.name.en, geo: saved.geo } });
    return saved;
  },

  /** Only unused destinations can be deleted; anything referenced must be deactivated instead (keeps history intact). */
  'destinations.delete': (ctx, { id }) => {
    const { org } = assertPermission(ctx, 'locations.manage');
    const existing = ctx.db.get('destinations', id);
    if (!existing) throw notFound('Destination');
    const products = ctx.db.filter('products', (p) => p.destinationId === id).length;
    const rules = ctx.db.filter('markupRules', (r) => r.match.destinationIds?.includes(id) ?? false).length;
    if (products + rules > 0) {
      throw new ApiException('CONFLICT', `In use by ${products} products and ${rules} pricing rules — deactivate it instead`, [{ field: 'id', issue: 'validation.in_use' }]);
    }
    for (const p of ctx.db.filter('places', (x) => x.destinationId === id)) ctx.db.delete('places', p.id);
    ctx.db.delete('destinations', id);
    audit(ctx, { tenantId: org.id, action: 'locations.destination_deleted', entity: 'destination', entityId: id, before: { code: existing.code, name: existing.name.en } });
    return { deleted: true as const };
  },

  'places.list': (ctx, { destinationId, kinds, includeInactive }) => {
    const admin = includeInactive && ctx.principal?.org.type === 'platform';
    return ctx.db.filter('places', (p) => (!destinationId || p.destinationId === destinationId) && (!kinds?.length || kinds.includes(p.kind)) && (admin || p.active))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.en.localeCompare(b.name.en));
  },

  'places.save': (ctx, { id, ...input }) => {
    const { org } = assertPermission(ctx, 'locations.manage');
    const dest = ctx.db.get('destinations', input.destinationId);
    if (!dest) throw new ApiException('VALIDATION_ERROR', 'Unknown destination', [{ field: 'destinationId', issue: 'validation.invalid_value' }]);
    // Places must sit in their destination's area — catches swapped lat/lng and wrong-city coordinates.
    const km = distanceKm(dest.geo, input.geo);
    const limit = input.kind === 'airport' ? 120 : 60;
    if (km > limit) {
      throw new ApiException('VALIDATION_ERROR', `These coordinates are ${km} km from ${dest.name.en}; check latitude and longitude`, [{ field: 'geo.lat', issue: 'validation.too_far' }]);
    }
    const now = ctx.clock.nowIso();
    if (id) {
      const existing = ctx.db.get('places', id);
      if (!existing) throw notFound('Place');
      const saved = ctx.db.replace('places', { ...existing, ...input, version: existing.version + 1, updatedAt: now });
      audit(ctx, { tenantId: org.id, action: 'locations.place_updated', entity: 'place', entityId: id,
        before: { name: existing.name.en, kind: existing.kind, geo: existing.geo, active: existing.active }, after: { name: saved.name.en, kind: saved.kind, geo: saved.geo, active: saved.active } });
      return saved;
    }
    const saved = ctx.db.insert('places', { id: createId('plc', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, ...input });
    audit(ctx, { tenantId: org.id, action: 'locations.place_created', entity: 'place', entityId: saved.id, after: { name: saved.name.en, kind: saved.kind, geo: saved.geo } });
    return saved;
  },

  'places.delete': (ctx, { id }) => {
    const { org } = assertPermission(ctx, 'locations.manage');
    const existing = ctx.db.get('places', id);
    if (!existing) throw notFound('Place');
    ctx.db.delete('places', id);
    audit(ctx, { tenantId: org.id, action: 'locations.place_deleted', entity: 'place', entityId: id, before: { name: existing.name.en, kind: existing.kind, geo: existing.geo } });
    return { deleted: true as const };
  },

  'places.hotelLocation': (ctx, { destinationId, geo, address, neighborhood }) => {
    const destination = ctx.db.get('destinations', destinationId);
    if (!destination) throw notFound('Destination');
    const at = geo ?? destination.geo;
    const places = ctx.db.filter('places', (p) => p.destinationId === destinationId && p.active);
    const nearby = (Object.keys(NEARBY_PER_KIND) as (keyof typeof NEARBY_PER_KIND)[])
      .flatMap((kind) => nearest(at, places.filter((p) => p.kind === kind), NEARBY_PER_KIND[kind]));
    const hood = neighborhood ?? nearest(at, places.filter((p) => p.kind === 'neighborhood'), 1)[0]?.name.en ?? null;
    return {
      geo: at, address, neighborhood: hood, destination, distanceFromCentreKm: distanceKm(destination.geo, at), nearby,
      directionsUrl: `https://www.openstreetmap.org/directions?to=${at.lat}%2C${at.lng}#map=16/${at.lat}/${at.lng}`,
    };
  },
};
