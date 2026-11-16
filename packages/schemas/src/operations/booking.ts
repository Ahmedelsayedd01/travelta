import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, listQuerySchema, localizedTextSchema, minorAmountSchema } from '../primitives';
import { holdReasonSchema, paymentTypeSchema } from '../enums';
import {
  bookingEntitySchema, bookingEventEntitySchema, bookingItemEntitySchema, cartEntitySchema, cartItemSchema, customerEntitySchema, supplierRequestLogEntitySchema,
  customerKindSchema, itemDetailsSchema, manualItemInputSchema, travellerSchema,
} from '../entities/booking';
import { customerTypeSchema, priceBreakdownSchema } from '../entities/pricing';
import { op } from './define';
import { pageOf } from './reference';

const idInput = z.object({ id: z.string() });

// ---- Customers --------------------------------------------------------------------------------------------------
export const customerInputSchema = z.object({
  id: z.string().optional(),
  kind: customerKindSchema,
  name: z.string().trim().min(2, { error: 'validation.too_short' }).max(120),
  email: z.union([z.literal(''), z.email({ error: 'validation.invalid_email' })]).default(''),
  phone: z.string().trim().max(30).default(''),
  nationalityIso2: z.string().length(2).nullable().default(null),
  customerType: customerTypeSchema.default('individual'),
  source: customerEntitySchema.shape.source.default('walk_in'),
  tags: z.array(z.string().max(30)).max(10).default([]),
  notes: z.string().max(2000).default(''),
}).refine((c) => c.email !== '' || c.phone !== '', { error: 'validation.contact_required', path: ['phone'] });
export type CustomerInput = z.input<typeof customerInputSchema>;

export const customerListItemSchema = customerEntitySchema.extend({ bookingsCount: z.number().int(), totalSpentMinor: z.number().int() });

// ---- Cart -------------------------------------------------------------------------------------------------------
/** Responses carry the viewer's projection of each quote (never the full breakdown below the platform). */
export const cartItemDtoSchema = cartItemSchema.extend({
  priceMinor: minorAmountSchema,
  taxMinor: minorAmountSchema,
  buyMinor: minorAmountSchema.nullable(),
  expired: z.boolean(),
});
export type CartItemDto = z.infer<typeof cartItemDtoSchema>;

export const cartDtoSchema = cartEntitySchema.omit({ items: true }).extend({
  items: z.array(cartItemDtoSchema),
  totalMinor: minorAmountSchema,
  /** Promo discount included in the total (customer-facing). */
  discountMinor: minorAmountSchema,
  /** Agency cost of the whole cart (staff only) — what the wallet must cover for network/API stock. */
  costMinor: minorAmountSchema.nullable(),
  audience: z.enum(['platform', 'agency', 'sub_agency', 'customer']),
});
export type CartDto = z.infer<typeof cartDtoSchema>;

export const addOfferInputSchema = z.object({
  offerId: z.string(),
  customerType: customerTypeSchema.default('individual'),
  channel: z.enum(['b2b', 'b2c']).optional(),
  nationalityIso2: z.string().length(2).optional(),
  storefront: z.string().optional(),
});

export const recheckOutputSchema = z.object({
  cart: cartDtoSchema,
  changes: z.array(z.object({
    itemId: z.string(),
    status: z.enum(['ok', 'price_changed', 'unavailable']),
    oldPriceMinor: minorAmountSchema,
    newPriceMinor: minorAmountSchema.nullable(),
  })),
});
export type RecheckOutput = z.infer<typeof recheckOutputSchema>;

// ---- Checkout ---------------------------------------------------------------------------------------------------
export const installmentInputSchema = z.object({ amountMinor: z.number().int(), dueDate: isoDateSchema });

/** Test cards (MOCK_DATA_ARCHITECTURE §6): 4242… succeeds, 4000 0000 0000 0002 declines, 4000 0000 0000 9995 insufficient funds. */
export const cardInputSchema = z.object({
  number: z.string().transform((v) => v.replace(/\s/g, '')).pipe(z.string().regex(/^\d{16}$/, { error: 'validation.card_number' })),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, { error: 'validation.card_expiry' }),
  cvc: z.string().regex(/^\d{3,4}$/, { error: 'validation.card_cvc' }),
  holder: z.string().trim().min(2, { error: 'validation.required' }).max(80),
  /** 3-D Secure challenge answer (test card 4000 0000 0000 3220 → 123456). */
  threeDsCode: z.string().max(10).optional(),
});

export const checkoutPaymentSchema = z.discriminatedUnion('method', [
  /** Staff: the end customer pays the agency per plan (PAY-1/2); stock cost comes from the wallet (WAL-3). */
  z.object({ method: z.literal('plan'), type: paymentTypeSchema, installments: z.array(installmentInputSchema).max(12).default([]) }),
  /** Storefront: card authorised now, captured at confirmation (PAY-6). */
  z.object({ method: z.literal('card'), card: cardInputSchema }),
  /** Storefront pay-later (only when the seller enables it). */
  z.object({ method: z.literal('pay_later') }),
]);
export type CheckoutPayment = z.input<typeof checkoutPaymentSchema>;

export const checkoutInputSchema = z.object({
  /** Client-generated; resubmitting the same key returns the same booking (DATA_CONTRACTS §7). */
  idempotencyKey: z.string().min(8).max(64),
  customerId: z.string().nullable(),
  /** Inline customer creation (W3 step 1). */
  newCustomer: customerInputSchema.nullable().default(null),
  items: z.array(z.object({
    itemId: z.string(),
    travellers: z.array(travellerSchema).min(1),
    details: itemDetailsSchema.default({}),
    /** The price the user accepted (QTE-2): submit fails with PRICE_CHANGED if the recheck differs. */
    acceptedPriceMinor: minorAmountSchema,
  })).min(1),
  payment: checkoutPaymentSchema,
  notes: z.string().max(1000).default(''),
});
export type CheckoutInput = z.input<typeof checkoutInputSchema>;

// ---- Bookings (read) --------------------------------------------------------------------------------------------
export const ITEM_ACTIONS = ['confirm', 'reject', 'voucher', 'no_show', 'cancel', 'retry', 'approve_credit'] as const;
export const bookingItemDtoSchema = bookingItemEntitySchema.extend({ priceMinor: minorAmountSchema, taxMinor: minorAmountSchema, costMinor: minorAmountSchema.nullable(), actions: z.array(z.enum(ITEM_ACTIONS)) });
export type BookingItemDto = z.infer<typeof bookingItemDtoSchema>;

export const bookingDtoSchema = bookingEntitySchema.extend({
  sellerName: z.string(),
  customerName: z.string().nullable(),
  createdByName: z.string(),
  items: z.array(bookingItemDtoSchema),
  events: z.array(bookingEventEntitySchema),
  audience: z.enum(['platform', 'agency', 'sub_agency', 'customer', 'supplier']),
  /** BKG-9: a manual/network item still pending 24h after creation. */
  overdueConfirmation: z.boolean(),
});
export type BookingDto = z.infer<typeof bookingDtoSchema>;

export const bookingListItemSchema = z.object({
  id: z.string(), ref: z.string(), status: bookingEntitySchema.shape.status, paymentStatus: bookingEntitySchema.shape.paymentStatus,
  channel: bookingEntitySchema.shape.channel, sellerName: z.string(), customerName: z.string().nullable(), leadTraveller: z.string(),
  services: z.array(bookingItemEntitySchema.shape.serviceType), title: localizedTextSchema, itemsCount: z.number().int(),
  travelStart: isoDateSchema, travelEnd: isoDateSchema, createdAt: isoDateTimeSchema, currency: bookingEntitySchema.shape.currency,
  totalMinor: minorAmountSchema, paidMinor: minorAmountSchema, holdReasons: z.array(holdReasonSchema), overdueConfirmation: z.boolean(),
});
export type BookingListItem = z.infer<typeof bookingListItemSchema>;

const itemRef = z.object({ bookingId: z.string(), itemId: z.string() });

/** Fields operations may fill after booking — never prices (BKG-5). */
export const opsDetailsSchema = itemDetailsSchema.pick({ pnr: true, ticketNo: true, driver: true, specialRequests: true, pickupPoint: true, time: true, appointmentDate: true });

/** Ops board / supplier reservations: one row per booking item. */
export const boardItemSchema = z.object({
  bookingId: z.string(), itemId: z.string(), ref: z.string(), seq: z.number().int(), serviceType: bookingItemEntitySchema.shape.serviceType,
  title: localizedTextSchema, subtitle: localizedTextSchema, status: bookingItemEntitySchema.shape.status, holdReason: holdReasonSchema.nullable(),
  source: bookingItemEntitySchema.shape.source, ownership: bookingItemEntitySchema.shape.ownership, supplierName: z.string(), sellerName: z.string(),
  leadTraveller: z.string(), pax: z.number().int(), from: isoDateSchema, to: isoDateSchema.nullable(), createdAt: isoDateTimeSchema,
  supplierRef: z.string().nullable(), voucherNo: z.string().nullable(), overdueConfirmation: z.boolean(),
  /** What the viewer can do with this item right now (the server enforces the same rules). */
  actions: z.array(z.enum(ITEM_ACTIONS)),
  amountMinor: minorAmountSchema, currency: bookingEntitySchema.shape.currency,
});
export type BoardItem = z.infer<typeof boardItemSchema>;

export const bookingOperations = {
  'customers.list': op({ input: listQuerySchema, output: pageOf(customerListItemSchema), http: { method: 'GET', path: '/customers' }, auth: 'session' }),
  'customers.get': op({ input: idInput, output: customerEntitySchema, http: { method: 'GET', path: '/customers/:id' }, auth: 'session' }),
  'customers.save': op({ input: customerInputSchema, output: customerEntitySchema, http: { method: 'POST', path: '/customers' }, auth: 'session' }),

  'cart.get': op({ input: z.object({ storefront: z.string().optional() }).default({}), output: cartDtoSchema, http: { method: 'GET', path: '/cart' }, auth: 'session' }),
  'cart.addOffer': op({ input: addOfferInputSchema, output: cartDtoSchema, http: { method: 'POST', path: '/cart/items' }, auth: 'session' }),
  'cart.previewManual': op({ input: manualItemInputSchema, output: z.object({ breakdown: priceBreakdownSchema }), http: { method: 'POST', path: '/cart/manual/preview' }, auth: 'session' }),
  'cart.addManual': op({ input: manualItemInputSchema, output: cartDtoSchema, http: { method: 'POST', path: '/cart/manual' }, auth: 'session' }),
  'cart.applyPromo': op({ input: z.object({ code: z.string().trim().max(20).nullable(), storefront: z.string().optional() }), output: cartDtoSchema, http: { method: 'POST', path: '/cart/promo' }, auth: 'session' }),
  'cart.removeItem': op({ input: z.object({ itemId: z.string(), storefront: z.string().optional() }), output: cartDtoSchema, http: { method: 'DELETE', path: '/cart/items/:itemId' }, auth: 'session' }),
  'checkout.recheck': op({ input: z.object({ storefront: z.string().optional() }).default({}), output: recheckOutputSchema, http: { method: 'POST', path: '/checkout/recheck' }, auth: 'session' }),
  'checkout.submit': op({ input: checkoutInputSchema.extend({ storefront: z.string().optional(), requestId: z.string().optional() }), output: bookingDtoSchema, http: { method: 'POST', path: '/checkout' }, auth: 'session' }),

  'bookings.list': op({ input: listQuerySchema, output: pageOf(bookingListItemSchema), http: { method: 'GET', path: '/bookings' }, auth: 'session' }),
  'bookings.get': op({ input: idInput, output: bookingDtoSchema, http: { method: 'GET', path: '/bookings/:id' }, auth: 'session' }),
  'bookings.board': op({ input: listQuerySchema, output: pageOf(boardItemSchema), http: { method: 'GET', path: '/bookings/board' }, auth: 'session' }),
  'bookings.confirmItem': op({ input: itemRef.extend({ supplierRef: z.string().trim().min(2, { error: 'validation.required' }).max(40), details: opsDetailsSchema.default({}) }), output: bookingDtoSchema, http: { method: 'POST', path: '/bookings/:bookingId/items/:itemId/confirm' }, auth: 'session' }),
  'bookings.rejectItem': op({ input: itemRef.extend({ reason: z.string().trim().min(3, { error: 'validation.too_short' }).max(300) }), output: bookingDtoSchema, http: { method: 'POST', path: '/bookings/:bookingId/items/:itemId/reject' }, auth: 'session' }),
  'bookings.voucherItem': op({ input: itemRef, output: bookingDtoSchema, http: { method: 'POST', path: '/bookings/:bookingId/items/:itemId/voucher' }, auth: 'session' }),
  'bookings.markNoShow': op({ input: itemRef, output: bookingDtoSchema, http: { method: 'POST', path: '/bookings/:bookingId/items/:itemId/no-show' }, auth: 'session' }),
  'bookings.retrySupplier': op({ input: itemRef, output: bookingDtoSchema, http: { method: 'POST', path: '/bookings/:bookingId/items/:itemId/retry' }, auth: 'session' }),
  'bookings.updateItemDetails': op({ input: itemRef.extend({ details: opsDetailsSchema }), output: bookingDtoSchema, http: { method: 'PATCH', path: '/bookings/:bookingId/items/:itemId' }, auth: 'session' }),
  'bookings.addNote': op({ input: z.object({ bookingId: z.string(), text: z.string().trim().min(1, { error: 'validation.required' }).max(1000) }), output: bookingDtoSchema, http: { method: 'POST', path: '/bookings/:bookingId/notes' }, auth: 'session' }),
  'bookings.supplierLogs': op({ input: z.object({ bookingId: z.string() }), output: z.array(supplierRequestLogEntitySchema), http: { method: 'GET', path: '/bookings/:bookingId/supplier-logs' }, auth: 'session' }),
} as const;
