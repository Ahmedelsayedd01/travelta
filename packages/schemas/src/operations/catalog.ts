import { z } from 'zod';
import { currencySchema, isoDateSchema, listQuerySchema, localizedTextSchema } from '../primitives';
import { inventorySourceSchema } from '../enums';
import { PRODUCT_STATUSES, productDetailsSchema, productEntitySchema, rateUnitSchema } from '../entities/catalog';
import { pageOf } from './reference';
import { op } from './define';

export const productListItemSchema = productEntitySchema.pick({
  id: true, serviceType: true, source: true, name: true, destinationId: true, currency: true, rating: true, status: true, imageSeed: true, updatedAt: true, ownerTenantId: true,
}).extend({
  ownerName: localizedTextSchema,
  destinationName: localizedTextSchema,
  unitCount: z.number().int(),
  fromNetMinor: z.number().int(),
});
export type ProductListItem = z.infer<typeof productListItemSchema>;

export const productInputSchema = z.object({
  id: z.string().optional(),
  source: inventorySourceSchema.refine((s) => s === 'extranet' || s === 'manual', { error: 'validation.invalid_value' }),
  supplier: z.object({ kind: z.enum(['network', 'own']), id: z.string() }),
  name: localizedTextSchema,
  description: localizedTextSchema,
  destinationId: z.string().min(1, { error: 'validation.required' }),
  currency: currencySchema,
  status: z.enum(['draft', 'live', 'paused']),
  /** Platform admin only: the supplier or agency that owns a new product (ignored on update). */
  ownerTenantId: z.string().optional(),
  details: productDetailsSchema,
  units: z.array(rateUnitSchema).min(1, { error: 'validation.required' }),
  seasons: productEntitySchema.shape.seasons,
});
export type ProductInput = z.input<typeof productInputSchema>;

export const calendarDaySchema = z.object({
  date: isoDateSchema, offered: z.boolean(), allotment: z.number().int(), sold: z.number().int(), available: z.number().int(),
  stopSell: z.boolean(), netMinor: z.number().int(), overridden: z.boolean(),
});
export type CalendarDay = z.infer<typeof calendarDaySchema>;

export const bulkUpdateInputSchema = z.object({
  productId: z.string(),
  unitIds: z.array(z.string()).min(1, { error: 'validation.required' }),
  from: isoDateSchema,
  to: isoDateSchema,
  /** Weekdays to apply to (0 = Sunday); empty = every day. */
  weekdays: z.array(z.number().int().min(0).max(6)),
  set: z.object({
    allotment: z.number().int().min(0).max(10_000).optional(),
    stopSell: z.boolean().optional(),
    /** Net in minor units of the product currency; null clears a date-specific net. */
    netMinor: z.number().int().min(0).nullable().optional(),
  }).refine((s) => s.allotment !== undefined || s.stopSell !== undefined || s.netMinor !== undefined, { error: 'validation.required' }),
}).refine((b) => b.to >= b.from, { error: 'validation.invalid_date', path: ['to'] })
  .refine((b) => b.to <= addYear(b.from), { error: 'validation.range_too_long', path: ['to'] });
export type BulkUpdateInput = z.input<typeof bulkUpdateInputSchema>;

function addYear(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export const catalogOperations = {
  'catalog.list': op({ input: listQuerySchema, output: pageOf(productListItemSchema), http: { method: 'GET', path: '/catalog/products' }, auth: 'session' }),
  'catalog.get': op({ input: z.object({ id: z.string() }), output: productEntitySchema, http: { method: 'GET', path: '/catalog/products/:id' }, auth: 'session' }),
  'catalog.save': op({ input: productInputSchema, output: productEntitySchema, http: { method: 'PUT', path: '/catalog/products' }, auth: 'session' }),
  'catalog.setStatus': op({ input: z.object({ id: z.string(), status: z.enum(PRODUCT_STATUSES) }), output: productEntitySchema, http: { method: 'POST', path: '/catalog/products/:id/status' }, auth: 'session' }),
  /** Hard delete — only for products never booked; anything with history is archived instead (dependency check). */
  'catalog.delete': op({ input: z.object({ id: z.string() }), output: z.object({ deleted: z.literal(true) }), http: { method: 'DELETE', path: '/catalog/products/:id' }, auth: 'session' }),
  'inventory.calendar': op({
    input: z.object({ productId: z.string(), unitId: z.string(), from: isoDateSchema, days: z.number().int().min(1).max(62) }),
    output: z.array(calendarDaySchema), http: { method: 'GET', path: '/inventory/:productId/:unitId/calendar' }, auth: 'session',
  }),
  'inventory.bulkUpdate': op({ input: bulkUpdateInputSchema, output: z.object({ updatedDays: z.number().int() }), http: { method: 'POST', path: '/inventory/bulk' }, auth: 'session' }),
} as const;
