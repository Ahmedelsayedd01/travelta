import { z } from 'zod';
import { currencySchema, geoPointSchema, isoDateSchema, localizedTextSchema } from '../primitives';
import { inventorySourceSchema, serviceTypeSchema, supplierOwnershipSchema } from '../enums';
import { cancellationPolicySchema, mealPlanSchema, productDetailsSchema } from '../entities/catalog';
import { customerTypeSchema, priceBreakdownSchema } from '../entities/pricing';
import { op } from './define';

export const roomRequestSchema = z.object({
  adults: z.number().int().min(1).max(6),
  childAges: z.array(z.number().int().min(0).max(17)).max(4),
});

/** One search form for all seven services; fields not relevant to a service are ignored (W2 table). */
export const searchInputSchema = z.object({
  serviceType: serviceTypeSchema,
  destinationId: z.string().optional(),
  /** Check-in / travel / departure date. */
  from: isoDateSchema,
  /** Check-out (hotels). */
  to: isoDateSchema.optional(),
  rooms: z.array(roomRequestSchema).min(1).max(5).optional(),
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(8),
  infants: z.number().int().min(0).max(4),
  /** Flights. */
  fromCode: z.string().length(3).optional(),
  toCode: z.string().length(3).optional(),
  nationalityIso2: z.string().length(2).optional(),
  customerType: customerTypeSchema.default('individual'),
  /** Staff only: selling to an end customer (b2c) or to a sub-agent (b2b). */
  channel: z.enum(['b2b', 'b2c']).optional(),
  /** Public storefront search (no session): storefront slug of the seller; default Travelta Direct. */
  storefront: z.string().optional(),
  currency: currencySchema.optional(),
  filters: z.object({
    sources: z.array(z.enum(['extranet', 'b2b', 'global'])).optional(),
    refundableOnly: z.boolean().optional(),
    minStars: z.number().int().min(1).max(5).optional(),
    maxPriceMinor: z.number().int().optional(),
    mealPlans: z.array(mealPlanSchema).optional(),
    q: z.string().max(100).optional(),
    /** Map view: only results whose position falls inside the visible map area. */
    bounds: z.object({ south: z.number(), west: z.number(), north: z.number(), east: z.number() }).optional(),
  }).default({}),
  sort: z.enum(['price_asc', 'price_desc', 'rating', 'name', 'distance']).default('price_asc'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(12),
}).refine((s) => s.serviceType !== 'hotel' || (s.to !== undefined && s.to > s.from), { error: 'validation.invalid_date', path: ['to'] })
  .refine((s) => s.serviceType !== 'flight' || Boolean(s.toCode || s.destinationId), { error: 'validation.required', path: ['toCode'] });
export type SearchInput = z.input<typeof searchInputSchema>;
export type SearchParams = z.output<typeof searchInputSchema>;

export const offerOptionSchema = z.object({
  offerId: z.string(),
  source: inventorySourceSchema,
  ownership: supplierOwnershipSchema,
  unitName: localizedTextSchema,
  mealPlan: mealPlanSchema.nullable(),
  refundable: z.boolean(),
  policy: cancellationPolicySchema,
  nights: z.number().int(),
  quantity: z.number().int(),
  times: z.array(z.string()),
  /** What the viewer charges their customer (customer total incl. tax). */
  priceMinor: z.number().int(),
  taxMinor: z.number().int(),
  /** Agencies / sub-agencies only: their buy price (cost). Never present for customers. */
  buyMinor: z.number().int().nullable(),
  /** Staff only: the viewer's own revenue on this offer (agency / sub-agency markup, or platform revenue). */
  marginMinor: z.number().int().nullable(),
  currency: currencySchema,
  available: z.number().int(),
  /** Max adults per unit (hotel room, vehicle); null when the product sells per person. */
  capacity: z.number().int().nullable(),
});
export type OfferOption = z.infer<typeof offerOptionSchema>;

export const searchResultSchema = z.object({
  key: z.string(),
  productId: z.string().nullable(),
  serviceType: serviceTypeSchema,
  name: localizedTextSchema,
  description: localizedTextSchema,
  destinationId: z.string(),
  destinationName: localizedTextSchema,
  imageSeed: z.number().int(),
  rating: z.number(),
  reviews: z.number().int(),
  stars: z.number().int().nullable(),
  details: productDetailsSchema,
  /** Which sources returned this product (v1 filter: Extranet / B2B / Global). */
  sources: z.array(inventorySourceSchema),
  cheapest: offerOptionSchema,
  options: z.array(offerOptionSchema),
  /** Hotels: map position (stored, or derived deterministically for API content) and distance from the destination centre. */
  geo: geoPointSchema.nullable(),
  distanceKm: z.number().nullable(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchOutputSchema = z.object({
  items: z.array(searchResultSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  currency: currencySchema,
  audience: z.enum(['platform', 'agency', 'sub_agency', 'customer']),
  /** Sources that failed or timed out (shown as a notice; results from others still return). */
  unavailableSources: z.array(inventorySourceSchema),
});
export type SearchOutput = z.infer<typeof searchOutputSchema>;

export const offerDetailOutputSchema = z.object({
  result: searchResultSchema,
  option: offerOptionSchema,
  breakdown: priceBreakdownSchema,
});
export type OfferDetail = z.infer<typeof offerDetailOutputSchema>;

export const searchOperations = {
  'search.run': op({ input: searchInputSchema, output: searchOutputSchema, http: { method: 'POST', path: '/search' }, auth: 'public' }),
  'search.offer': op({
    input: z.object({ offerId: z.string(), storefront: z.string().optional(), customerType: customerTypeSchema.default('individual'), channel: z.enum(['b2b', 'b2c']).optional(), currency: currencySchema.optional(), nationalityIso2: z.string().length(2).optional() }),
    output: offerDetailOutputSchema, http: { method: 'GET', path: '/search/offers/:offerId' }, auth: 'public',
  }),
} as const;
