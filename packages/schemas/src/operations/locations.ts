import { z } from 'zod';
import { geoPointSchema, localizedTextSchema } from '../primitives';
import { destinationEntitySchema, PLACE_KINDS, placeEntitySchema } from '../entities/reference';
import { op } from './define';

// ---- Location management (platform) and map lookups (public) -----------------------------------------------------------

export const destinationInputSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/, { error: 'validation.invalid_value' }),
  name: localizedTextSchema,
  countryIso2: z.string().length(2, { error: 'validation.required' }),
  kind: z.enum(['city', 'region']),
  timezone: z.string().min(3, { error: 'validation.required' }),
  popular: z.boolean(),
  geo: geoPointSchema,
  zoom: z.number().int().min(3).max(18),
  active: z.boolean(),
});
export type DestinationInput = z.input<typeof destinationInputSchema>;

export const placeInputSchema = z.object({
  id: z.string().optional(),
  destinationId: z.string().min(1, { error: 'validation.required' }),
  kind: z.enum(PLACE_KINDS),
  name: localizedTextSchema,
  geo: geoPointSchema,
  active: z.boolean(),
});
export type PlaceInput = z.input<typeof placeInputSchema>;

export const nearbyPlaceSchema = placeEntitySchema.extend({ distanceKm: z.number() });
export type NearbyPlace = z.infer<typeof nearbyPlaceSchema>;

/** Everything a hotel map needs around one point: destination centre plus the nearest places of each kind. */
export const hotelLocationSchema = z.object({
  geo: geoPointSchema,
  address: z.string(),
  neighborhood: z.string().nullable(),
  destination: destinationEntitySchema,
  distanceFromCentreKm: z.number(),
  nearby: z.array(nearbyPlaceSchema),
  /** Opens the provider's directions page; no API key involved. */
  directionsUrl: z.string(),
});
export type HotelLocation = z.infer<typeof hotelLocationSchema>;

export const locationOperations = {
  'destinations.save': op({ input: destinationInputSchema, output: destinationEntitySchema, http: { method: 'PUT', path: '/destinations' }, auth: 'session' }),
  'destinations.delete': op({ input: z.object({ id: z.string() }), output: z.object({ deleted: z.literal(true) }), http: { method: 'DELETE', path: '/destinations/:id' }, auth: 'session' }),
  'places.list': op({
    input: z.object({ destinationId: z.string().optional(), kinds: z.array(z.enum(PLACE_KINDS)).optional(), includeInactive: z.boolean().optional() }),
    output: z.array(placeEntitySchema), http: { method: 'GET', path: '/places' }, auth: 'public',
  }),
  'places.save': op({ input: placeInputSchema, output: placeEntitySchema, http: { method: 'PUT', path: '/places' }, auth: 'session' }),
  'places.delete': op({ input: z.object({ id: z.string() }), output: z.object({ deleted: z.literal(true) }), http: { method: 'DELETE', path: '/places/:id' }, auth: 'session' }),
  /** Public: location card for a hotel product or search result (by product id or by offer key). */
  'places.hotelLocation': op({
    input: z.object({ destinationId: z.string(), geo: geoPointSchema.nullable(), address: z.string().default(''), neighborhood: z.string().nullable().default(null) }),
    output: hotelLocationSchema, http: { method: 'POST', path: '/places/hotel-location' }, auth: 'public',
  }),
} as const;
