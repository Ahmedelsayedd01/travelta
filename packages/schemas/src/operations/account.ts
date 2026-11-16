import { z } from 'zod';
import { localeSchema } from '../primitives';
import { cardInputSchema } from './booking';
import { bookingFinanceSchema } from './finance';
import { favoriteEntitySchema } from '../entities/favorites';
import { op } from './define';

// ---- Storefront customer self-service (M21, W12) ----------------------------------------------------------------------------
export const profileInputSchema = z.object({
  name: z.string().trim().min(2, { error: 'validation.too_short' }).max(120),
  phone: z.string().trim().max(30).default(''),
  locale: localeSchema,
  nationalityIso2: z.string().length(2).nullable().default(null),
});
export const supportInputSchema = z.object({
  topic: z.enum(['booking', 'payment', 'cancellation', 'other']),
  bookingId: z.string().nullable().default(null),
  message: z.string().trim().min(10, { error: 'validation.too_short' }).max(2000),
});

export const favoriteInputSchema = favoriteEntitySchema.pick({ key: true, serviceType: true, name: true, destinationId: true, destinationName: true, imageSeed: true, rating: true });
export type FavoriteInput = z.input<typeof favoriteInputSchema>;

export const accountOperations = {
  'favorites.list': op({ input: z.void(), output: z.array(favoriteEntitySchema), http: { method: 'GET', path: '/account/favorites' }, auth: 'session' }),
  /** Add when missing, remove when present; answers the new state. */
  'favorites.toggle': op({ input: favoriteInputSchema, output: z.object({ favorited: z.boolean() }), http: { method: 'POST', path: '/account/favorites/toggle' }, auth: 'session' }),
  'account.updateProfile': op({ input: profileInputSchema, output: z.object({ name: z.string(), phone: z.string(), locale: localeSchema, nationalityIso2: z.string().nullable() }), http: { method: 'PATCH', path: '/account/profile' }, auth: 'session' }),
  'account.payByCard': op({ input: z.object({ bookingId: z.string(), card: cardInputSchema }), output: bookingFinanceSchema, http: { method: 'POST', path: '/account/bookings/:bookingId/pay' }, auth: 'session' }),
  'account.support': op({ input: supportInputSchema, output: z.object({ ticket: z.string() }), http: { method: 'POST', path: '/account/support' }, auth: 'session' }),
} as const;
