import { z } from 'zod';
import { currencySchema, geoPointSchema, isoDateSchema, localizedTextSchema } from '../primitives';
import { entityBaseSchema } from './base';

export const currencyEntitySchema = entityBaseSchema.extend({
  code: currencySchema,
  name: localizedTextSchema,
  symbol: z.string().min(1).max(6),
  exponent: z.number().int().min(0).max(4),
  active: z.boolean(),
});
export type CurrencyEntity = z.infer<typeof currencyEntitySchema>;

export const countryEntitySchema = entityBaseSchema.extend({
  iso2: z.string().length(2),
  name: localizedTextSchema,
  nationality: localizedTextSchema,
  dialCode: z.string().regex(/^\+\d{1,4}$/),
});
export type CountryEntity = z.infer<typeof countryEntitySchema>;

export const destinationEntitySchema = entityBaseSchema.extend({
  code: z.string().min(2).max(12),
  name: localizedTextSchema,
  countryIso2: z.string().length(2),
  kind: z.enum(['city', 'region']),
  timezone: z.string().min(3),
  popular: z.boolean(),
  /** Map centre and default zoom for destination maps. */
  geo: geoPointSchema,
  zoom: z.number().int().min(3).max(18),
  /** Inactive destinations disappear from public search forms but keep their history. */
  active: z.boolean(),
});
export type DestinationEntity = z.infer<typeof destinationEntitySchema>;

/** Points of interest shown around hotels: attractions, airports, public transport, neighbourhoods (maps §5). */
export const PLACE_KINDS = ['attraction', 'airport', 'transit', 'neighborhood'] as const;
export const placeEntitySchema = entityBaseSchema.extend({
  destinationId: z.string().min(1, { error: 'validation.required' }),
  kind: z.enum(PLACE_KINDS),
  name: localizedTextSchema,
  geo: geoPointSchema,
  active: z.boolean(),
});
export type PlaceEntity = z.infer<typeof placeEntitySchema>;

export const nationalityGroupEntitySchema = entityBaseSchema.extend({
  code: z.string().min(2).max(24),
  name: localizedTextSchema,
  countryIso2: z.array(z.string().length(2)).min(1),
});
export type NationalityGroupEntity = z.infer<typeof nationalityGroupEntitySchema>;

/** Rate = units of `quote` per 1 unit of `base`, effective for the calendar `date` (FX-1..3). */
export const fxRateEntitySchema = entityBaseSchema.extend({
  base: currencySchema,
  quote: currencySchema,
  rate: z.number().positive(),
  date: isoDateSchema,
  source: z.enum(['seed', 'manual']),
  isDemoValue: z.boolean(),
});
export type FxRateEntity = z.infer<typeof fxRateEntitySchema>;
