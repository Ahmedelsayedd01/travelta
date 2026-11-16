import { z } from 'zod';
import { currencySchema, isoDateSchema, isoDateTimeSchema, localizedTextSchema, minorAmountSchema } from '../primitives';
import { bookingItemStatusSchema, holdReasonSchema, inventorySourceSchema, paymentTypeSchema, serviceTypeSchema, supplierOwnershipSchema } from '../enums';
import { entityBaseSchema, tenantEntityBaseSchema } from './base';
import { cancellationPolicySchema, mealPlanSchema } from './catalog';
import { kycFileSchema } from './kyc';
import { customerTypeSchema, fxSnapshotSchema, priceBreakdownSchema } from './pricing';

// ---- Customers (CRM-lite; leads & requests arrive in M17) -------------------------------------------------------
export const customerKindSchema = z.enum(['individual', 'corporate']);

export const customerEntitySchema = tenantEntityBaseSchema.extend({
  kind: customerKindSchema,
  name: z.string().min(2).max(120),
  email: z.string().max(160),
  phone: z.string().max(30),
  nationalityIso2: z.string().length(2).nullable(),
  /** Pricing segment used by markup rules (PRC-4). */
  customerType: customerTypeSchema,
  /** Storefront customers: the linked user account. */
  userId: z.string().nullable(),
  source: z.enum(['walk_in', 'phone', 'whatsapp', 'website', 'referral', 'storefront', 'social']),
  tags: z.array(z.string().max(30)).max(10),
  notes: z.string().max(2000),
});
export type CustomerEntity = z.infer<typeof customerEntitySchema>;

// ---- Travellers & per-service details (W2 table) ------------------------------------------------------------------
export const PASSPORT_SERVICES = ['flight', 'visa', 'umrah'] as const;

export const travellerSchema = z.object({
  type: z.enum(['adult', 'child', 'infant']),
  title: z.enum(['mr', 'mrs', 'ms', 'miss', 'mstr']),
  firstName: z.string().trim().min(1, { error: 'validation.required' }).max(60),
  lastName: z.string().trim().min(1, { error: 'validation.required' }).max(60),
  dateOfBirth: isoDateSchema.nullable(),
  nationalityIso2: z.string().length(2).nullable(),
  passportNo: z.string().trim().max(20).nullable(),
  passportExpiry: isoDateSchema.nullable(),
  /** Umrah: female pilgrims travel with a mahram (name & relation) — captured per traveller. */
  mahram: z.string().trim().max(120).nullable(),
  lead: z.boolean(),
});
export type Traveller = z.infer<typeof travellerSchema>;

export const itemDetailsSchema = z.object({
  specialRequests: z.string().max(500).optional(),
  /** Activity / tour slot; transfer pickup time. */
  time: z.string().max(10).optional(),
  language: z.string().max(10).optional(),
  pickupPoint: z.string().max(160).optional(),
  /** Transfers: arriving flight number. */
  flightNo: z.string().max(12).optional(),
  /** Visa appointment. */
  appointmentDate: isoDateSchema.optional(),
  /** Umrah room occupancy. */
  occupancy: z.enum(['double', 'triple', 'quad']).optional(),
  /** Visa supporting documents (passport scan, photo…). */
  documents: z.array(kycFileSchema).max(5).optional(),
  /** Free-text product line for manual bookings (e.g. "Deluxe room, sea view"). */
  description: z.string().max(300).optional(),
  /** Filled by operations at confirmation: PNR / ticket no. (flights), bus no. & driver (transfers). */
  pnr: z.string().max(20).optional(),
  ticketNo: z.string().max(30).optional(),
  driver: z.string().max(80).optional(),
});
export type ItemDetails = z.infer<typeof itemDetailsSchema>;

/** Search occupancy carried by an item (so checkout knows how many travellers to collect). */
export const occupancySchema = z.object({
  adults: z.number().int().min(1).max(30),
  children: z.number().int().min(0).max(20),
  infants: z.number().int().min(0).max(10),
  rooms: z.array(z.object({ adults: z.number().int(), childAges: z.array(z.number().int()) })),
});

// ---- Manual booking (W3) ------------------------------------------------------------------------------------------
export const manualItemInputSchema = z.object({
  serviceType: serviceTypeSchema,
  /** Own supplier (agency_suppliers) or a Travelta network supplier organization. */
  supplier: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('own'), id: z.string() }),
    z.object({ kind: z.literal('network'), id: z.string() }),
  ]),
  title: z.string().trim().min(2, { error: 'validation.required' }).max(160),
  destinationId: z.string().nullable(),
  from: isoDateSchema,
  to: isoDateSchema.nullable(),
  occupancy: occupancySchema,
  /** Total supplier cost for the item. */
  netMinor: z.number().int().positive({ error: 'validation.must_be_positive' }),
  netCurrency: currencySchema,
  markup: z.object({ mode: z.enum(['percent', 'fixed']), value: z.number().min(0) }),
  taxProfileId: z.string().nullable(),
  policy: cancellationPolicySchema,
  details: itemDetailsSchema,
  customerType: customerTypeSchema.default('individual'),
  channel: z.enum(['b2b', 'b2c']).default('b2c'),
}).refine((m) => m.to === null || m.to >= m.from, { error: 'validation.invalid_date', path: ['to'] });
export type ManualItemInput = z.input<typeof manualItemInputSchema>;

// ---- Cart (server-side, one open cart per user & seller) ----------------------------------------------------------
export const QUOTE_TTL_MINUTES = 15;

export const cartItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['offer', 'manual']),
  serviceType: serviceTypeSchema,
  title: localizedTextSchema,
  subtitle: localizedTextSchema,
  offerId: z.string().nullable(),
  manual: manualItemInputSchema.nullable(),
  source: inventorySourceSchema,
  ownership: supplierOwnershipSchema,
  from: isoDateSchema,
  to: isoDateSchema.nullable(),
  occupancy: occupancySchema,
  mealPlan: mealPlanSchema.nullable(),
  times: z.array(z.string()),
  policy: cancellationPolicySchema,
  customerType: customerTypeSchema,
  channel: z.enum(['b2b', 'b2c']),
  nationalityIso2: z.string().length(2).nullable(),
  /** The quote (QTE-1): full breakdown kept server-side; responses carry the viewer's projection. */
  breakdown: priceBreakdownSchema,
  quotedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  /** Set by a recheck that found a different price: the price the user saw before (QTE-2). */
  previousPriceMinor: minorAmountSchema.nullable(),
  unavailable: z.boolean(),
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const cartEntitySchema = tenantEntityBaseSchema.extend({
  userId: z.string(),
  status: z.enum(['open', 'checked_out']),
  currency: currencySchema,
  storefront: z.string().nullable(),
  /** Storefront promo code applied to every offer in the cart (priced by the engine, PRC promo rules). */
  promoCode: z.string().nullable(),
  items: z.array(cartItemSchema).max(10),
});
export type CartEntity = z.infer<typeof cartEntitySchema>;

// ---- Bookings (BKG) -----------------------------------------------------------------------------------------------
export const BOOKING_STATUSES = ['pending', 'partially_confirmed', 'confirmed', 'vouchered', 'travelled', 'cancelled'] as const;
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export const bookingPaymentStatusSchema = z.enum(['unpaid', 'authorized', 'partially_paid', 'paid', 'refunded']);

export const bookingNoteSchema = z.object({ id: z.string(), at: isoDateTimeSchema, userId: z.string(), userName: z.string(), text: z.string().max(1000) });

export const bookingEntitySchema = tenantEntityBaseSchema.extend({
  /** TRV-YYMM-XXXXX (BKG-8). tenantId = the selling organization. */
  ref: z.string(),
  channel: z.enum(['b2b', 'b2c', 'manual']),
  /** Top-level agency of the seller chain (null for platform retail) — whose wallet pays for network/API stock. */
  agencyId: z.string().nullable(),
  createdByUserId: z.string(),
  customerId: z.string().nullable(),
  status: bookingStatusSchema,
  paymentStatus: bookingPaymentStatusSchema,
  paymentType: paymentTypeSchema,
  currency: currencySchema,
  /** Locked at submit (FX-1). */
  fxSnapshot: z.array(fxSnapshotSchema),
  totals: z.object({ sellMinor: minorAmountSchema, taxMinor: minorAmountSchema, netMinor: minorAmountSchema, agencyCostMinor: minorAmountSchema, paidMinor: minorAmountSchema, refundedMinor: minorAmountSchema }),
  travelStart: isoDateSchema,
  travelEnd: isoDateSchema,
  leadTraveller: z.string(),
  idempotencyKey: z.string(),
  invoiceId: z.string().nullable(),
  notes: z.array(bookingNoteSchema),
});
export type BookingEntity = z.infer<typeof bookingEntitySchema>;

export const bookingItemEntitySchema = entityBaseSchema.extend({
  bookingId: z.string(),
  tenantId: z.string(),
  seq: z.number().int().min(1),
  kind: z.enum(['offer', 'manual']),
  serviceType: serviceTypeSchema,
  title: localizedTextSchema,
  subtitle: localizedTextSchema,
  source: inventorySourceSchema,
  ownership: supplierOwnershipSchema,
  /** Network supplier org (confirms in the supplier portal), or the agency's own supplier record. */
  supplierOrgId: z.string().nullable(),
  agencySupplierId: z.string().nullable(),
  supplierName: z.string(),
  productId: z.string().nullable(),
  unitId: z.string().nullable(),
  offerId: z.string().nullable(),
  from: isoDateSchema,
  to: isoDateSchema.nullable(),
  occupancy: occupancySchema,
  mealPlan: mealPlanSchema.nullable(),
  /** Stock consumed at confirmation and released at cancellation (BKG-3). */
  consume: z.array(z.object({ date: isoDateSchema, quantity: z.number().int().min(1) })),
  stockConsumed: z.boolean(),
  travellers: z.array(travellerSchema).min(1),
  details: itemDetailsSchema,
  /** Finalised at submit; ledger postings read its settlement (ACC-2). Never edited after confirmation (BKG-5). */
  breakdown: priceBreakdownSchema,
  policy: cancellationPolicySchema,
  supplierRef: z.string().nullable(),
  status: bookingItemStatusSchema,
  holdReason: holdReasonSchema.nullable(),
  voucherNo: z.string().nullable(),
  confirmedAt: isoDateTimeSchema.nullable(),
  voucheredAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  rejectReason: z.string().nullable(),
});
export type BookingItemEntity = z.infer<typeof bookingItemEntitySchema>;

/** Status history (BKG-1): every transition with actor and reason. */
export const bookingEventEntitySchema = tenantEntityBaseSchema.extend({
  bookingId: z.string(),
  itemId: z.string().nullable(),
  from: z.string().nullable(),
  to: z.string(),
  reason: z.string().max(500).nullable(),
  actorUserId: z.string().nullable(),
  actorName: z.string(),
  at: isoDateTimeSchema,
});
export type BookingEventEntity = z.infer<typeof bookingEventEntitySchema>;

/** Every adapter call (search/recheck/book/cancel) for live-API and manual suppliers (DATABASE_DESIGN §7). Admin-only. */
export const supplierRequestLogEntitySchema = tenantEntityBaseSchema.extend({
  bookingId: z.string().nullable(),
  itemId: z.string().nullable(),
  provider: inventorySourceSchema,
  operation: z.enum(['search', 'recheck', 'book', 'cancel']),
  outcome: z.enum(['confirmed', 'rejected', 'pending', 'timeout', 'cancelled', 'error']),
  latencyMs: z.number().int().min(0),
  request: z.string().max(2000),
  response: z.string().max(2000),
  at: isoDateTimeSchema,
});
export type SupplierRequestLogEntity = z.infer<typeof supplierRequestLogEntitySchema>;
