import { z } from 'zod';
import { localeSchema } from '../primitives';
import { cardInputSchema } from './booking';
import { bookingFinanceSchema } from './finance';
import { favoriteEntitySchema } from '../entities/favorites';
import { savedTravelerEntitySchema, supportTicketEntitySchema } from '../entities/account';
import { passwordSchema } from '../primitives';
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

export const savedTravelerInputSchema = savedTravelerEntitySchema.pick({ type: true, title: true, firstName: true, lastName: true, dateOfBirth: true, nationalityIso2: true, passportNo: true, passportExpiry: true })
  .extend({ id: z.string().optional() });
export type SavedTravelerInput = z.input<typeof savedTravelerInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, { error: 'validation.required' }),
  newPassword: passwordSchema,
}).refine((v) => v.currentPassword !== v.newPassword, { error: 'validation.password_unchanged', path: ['newPassword'] });
export type ChangePasswordInput = z.input<typeof changePasswordInputSchema>;

export const accountProfileSchema = z.object({ name: z.string(), email: z.string(), phone: z.string(), locale: localeSchema, nationalityIso2: z.string().nullable(), emailVerified: z.boolean() });

export const accountOperations = {
  'account.profile': op({ input: z.void(), output: accountProfileSchema, http: { method: 'GET', path: '/account/profile' }, auth: 'session' }),
  'travelers.list': op({ input: z.void(), output: z.array(savedTravelerEntitySchema), http: { method: 'GET', path: '/account/travelers' }, auth: 'session' }),
  'travelers.save': op({ input: savedTravelerInputSchema, output: savedTravelerEntitySchema, http: { method: 'PUT', path: '/account/travelers' }, auth: 'session' }),
  'travelers.delete': op({ input: z.object({ id: z.string() }), output: z.object({ deleted: z.literal(true) }), http: { method: 'DELETE', path: '/account/travelers/:id' }, auth: 'session' }),
  /** Requires the current password; other sessions are signed out, this one stays. */
  'account.changePassword': op({ input: changePasswordInputSchema, output: z.object({ ok: z.literal(true) }), http: { method: 'POST', path: '/account/password' }, auth: 'session' }),
  'account.tickets': op({ input: z.void(), output: z.array(supportTicketEntitySchema.extend({ bookingRef: z.string().nullable() })), http: { method: 'GET', path: '/account/support/tickets' }, auth: 'session' }),
  'favorites.list': op({ input: z.void(), output: z.array(favoriteEntitySchema), http: { method: 'GET', path: '/account/favorites' }, auth: 'session' }),
  /** Add when missing, remove when present; answers the new state. */
  'favorites.toggle': op({ input: favoriteInputSchema, output: z.object({ favorited: z.boolean() }), http: { method: 'POST', path: '/account/favorites/toggle' }, auth: 'session' }),
  'account.updateProfile': op({ input: profileInputSchema, output: z.object({ name: z.string(), phone: z.string(), locale: localeSchema, nationalityIso2: z.string().nullable() }), http: { method: 'PATCH', path: '/account/profile' }, auth: 'session' }),
  'account.payByCard': op({ input: z.object({ bookingId: z.string(), card: cardInputSchema }), output: bookingFinanceSchema, http: { method: 'POST', path: '/account/bookings/:bookingId/pay' }, auth: 'session' }),
  'account.support': op({ input: supportInputSchema, output: z.object({ ticket: z.string() }), http: { method: 'POST', path: '/account/support' }, auth: 'session' }),
} as const;
