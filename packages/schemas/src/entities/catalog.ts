import { z } from 'zod';
import { currencySchema, geoPointSchema, isoDateSchema, localizedTextSchema } from '../primitives';
import { inventorySourceSchema, serviceTypeSchema } from '../enums';
import { entityBaseSchema } from './base';

/** Archived = soft-deleted: hidden everywhere except admin lists and existing bookings. */
export const PRODUCT_STATUSES = ['draft', 'live', 'paused', 'archived'] as const;

/** Cancellation policy snapshot (CAN-1): fee by days before service start; non-refundable = 100%. */
export const cancellationPolicySchema = z.object({
  nonRefundable: z.boolean(),
  /** Sorted by daysBefore descending; the first rule whose daysBefore ≤ actual days-before applies. */
  rules: z.array(z.object({ daysBefore: z.number().int().min(0), feeType: z.enum(['percent', 'fixed', 'nights']), value: z.number().min(0) })),
});
export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>;

export const MEAL_PLANS = ['RO', 'BB', 'HB', 'FB', 'AI'] as const;
export const mealPlanSchema = z.enum(MEAL_PLANS);

/**
 * A sellable unit with compact pricing: base net per unit, weekend uplift, seasonal uplifts and a default allotment.
 * Only changed dates are stored (CalendarOverride), so a year of rates costs nothing until someone edits it.
 */
export const rateUnitSchema = z.object({
  id: z.string(),
  name: localizedTextSchema,
  /** Net in the product currency, minor units, per unit (room-night, adult, seat, vehicle, ticket…). */
  baseNetMinor: z.number().int().min(0),
  /** Secondary price for children (or infants) where relevant. */
  childNetMinor: z.number().int().min(0).nullable(),
  weekendUpliftPct: z.number().min(0).max(200),
  defaultAllotment: z.number().int().min(0).max(10_000),
  minStay: z.number().int().min(1).max(30),
  policy: cancellationPolicySchema,
  /** Hotel extras. */
  mealPlan: mealPlanSchema.nullable(),
  maxAdults: z.number().int().min(1).max(12).nullable(),
  maxChildren: z.number().int().min(0).max(8).nullable(),
  /** Activities/transfers/tours: departure or slot times (HH:MM). */
  times: z.array(z.string().regex(/^\d{2}:\d{2}$/)),
  /** Weekdays offered (0 = Sunday). Empty = every day. */
  weekdays: z.array(z.number().int().min(0).max(6)),
});
export type RateUnit = z.infer<typeof rateUnitSchema>;

/** Service-specific product details (DATABASE_DESIGN §4). */
export const productDetailsSchema = z.discriminatedUnion('serviceType', [
  z.object({ serviceType: z.literal('hotel'), stars: z.number().int().min(1).max(5), address: z.string(), amenities: z.array(z.string()), checkIn: z.string(), checkOut: z.string(), geo: geoPointSchema.nullable().default(null), neighborhood: z.string().max(80).nullable().default(null) }),
  z.object({ serviceType: z.literal('flight'), carrier: z.string(), flightNo: z.string(), fromCode: z.string(), toCode: z.string(), fromCity: localizedTextSchema, toCity: localizedTextSchema, departTime: z.string(), durationMin: z.number().int(), cabin: z.enum(['economy', 'business']), baggageKg: z.number().int() }),
  z.object({ serviceType: z.literal('tour'), durationDays: z.number().int().min(1), tourType: z.enum(['day', 'multi_day']), itinerary: z.array(localizedTextSchema), inclusions: z.array(localizedTextSchema), exclusions: z.array(localizedTextSchema), transport: z.string() }),
  z.object({ serviceType: z.literal('visa'), countryIso2: z.string().length(2), visaType: z.enum(['tourist', 'business', 'umrah', 'transit']), processingDays: z.number().int(), validityDays: z.number().int(), requiredDocs: z.array(localizedTextSchema) }),
  z.object({ serviceType: z.literal('umrah'), season: localizedTextSchema, makkahHotel: localizedTextSchema, makkahNights: z.number().int(), madinahHotel: localizedTextSchema, madinahNights: z.number().int(), includesFlight: z.boolean(), includesVisa: z.boolean(), includesTransport: z.boolean(), departureCity: localizedTextSchema }),
  z.object({ serviceType: z.literal('activity'), durationHours: z.number().min(0.5), languages: z.array(z.string()), highlights: z.array(localizedTextSchema), pickupPoints: z.array(z.string()), oldPriceMinor: z.number().int().nullable(), tags: z.array(z.string()) }),
  z.object({ serviceType: z.literal('transfer'), fromPlace: localizedTextSchema, toPlace: localizedTextSchema, durationMin: z.number().int(), mode: z.enum(['private', 'shared_bus']) }),
]);
export type ProductDetails = z.infer<typeof productDetailsSchema>;
export type ProductDetailsInput = z.input<typeof productDetailsSchema>;

/**
 * Catalog product (one collection for all seven services). Owned by a network supplier, an agency (own extranet /
 * own supplier), or — for API stock — produced by a mock adapter at search time (not stored here).
 */
export const productEntitySchema = entityBaseSchema.extend({
  ownerTenantId: z.string(),
  serviceType: serviceTypeSchema,
  source: inventorySourceSchema,
  /** Supply relationship: network supplier org, or the agency's own supplier record. */
  supplier: z.object({ kind: z.enum(['network', 'own']), id: z.string() }),
  name: localizedTextSchema,
  description: localizedTextSchema,
  destinationId: z.string(),
  currency: currencySchema,
  rating: z.number().min(0).max(5),
  reviews: z.number().int().min(0),
  /** Visual seed for generated imagery (no external images in the prototype). */
  imageSeed: z.number().int(),
  status: z.enum(PRODUCT_STATUSES),
  details: productDetailsSchema,
  units: z.array(rateUnitSchema).min(1),
  /** Seasonal uplifts applied to every unit. */
  seasons: z.array(z.object({ from: isoDateSchema, to: isoDateSchema, upliftPct: z.number().min(-50).max(300), name: z.string() })),
});
export type ProductEntity = z.infer<typeof productEntitySchema>;

/** Per-date changes to a rate unit (INVT-1): allotment, sold count, stop-sell or a fixed net for that date. */
export const calendarOverrideEntitySchema = entityBaseSchema.extend({
  productId: z.string(),
  unitId: z.string(),
  date: isoDateSchema,
  allotment: z.number().int().min(0).nullable(),
  sold: z.number().int().min(0),
  stopSell: z.boolean(),
  netMinor: z.number().int().min(0).nullable(),
});
export type CalendarOverrideEntity = z.infer<typeof calendarOverrideEntitySchema>;
