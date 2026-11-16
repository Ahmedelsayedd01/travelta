import { z } from 'zod';
import { emailSchema, isoDateTimeSchema, localeSchema, passwordSchema, phoneSchema, requiredText } from '../primitives';
import { orgStatusSchema, orgTypeSchema } from '../enums';
import { permissionSchema, roleTemplateKeySchema } from '../entities/identity';
import { op } from './define';

export const audienceSchema = z.enum(['staff', 'customer']);
export const portalSchema = z.enum(['admin', 'agency', 'supplier', 'account']);

/** What the client knows about the signed-in user. Permissions here are for UX only — every operation re-checks server-side. */
export const sessionDtoSchema = z.object({
  token: z.string(),
  expiresAt: isoDateTimeSchema,
  portal: portalSchema,
  user: z.object({ id: z.string(), name: z.string(), email: z.string(), phone: z.string().nullable(), locale: localeSchema, userType: audienceSchema, emailVerified: z.boolean() }),
  organization: z.object({
    id: z.string(),
    type: orgTypeSchema,
    name: z.object({ en: z.string(), ar: z.string() }),
    status: orgStatusSchema,
    parentId: z.string().nullable(),
    isPlatformRetail: z.boolean(),
  }),
  role: z.object({ id: z.string(), key: z.string(), name: z.object({ en: z.string(), ar: z.string() }) }).nullable(),
  permissions: z.array(permissionSchema),
  memberships: z.array(z.object({ tenantId: z.string(), orgName: z.object({ en: z.string(), ar: z.string() }), orgType: orgTypeSchema, roleName: z.object({ en: z.string(), ar: z.string() }) })),
});
export type SessionDto = z.infer<typeof sessionDtoSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'validation.required' }),
  /** `staff` = web portals, `customer` = storefront & mobile app. */
  audience: audienceSchema,
  /** Customer logins only: storefront slug of the selling organization (default Travelta Direct). */
  storefront: z.string().regex(/^[a-z0-9-]+$/).optional(),
});
export type LoginInput = z.input<typeof loginInputSchema>;

export const registerCustomerInputSchema = z.object({
  name: requiredText(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  locale: localeSchema,
  /** Storefront slug of the selling organization; omitted = Travelta Direct (global storefront / mobile app). */
  storefront: z.string().regex(/^[a-z0-9-]+$/).optional(),
});
export type RegisterCustomerInput = z.input<typeof registerCustomerInputSchema>;

export const demoAccountSchema = z.object({
  email: z.string(),
  name: z.string(),
  roleKey: roleTemplateKeySchema.or(z.literal('customer')),
  orgName: z.object({ en: z.string(), ar: z.string() }),
  orgType: orgTypeSchema,
  orgStatus: orgStatusSchema,
  audience: audienceSchema,
  portal: portalSchema,
});
export type DemoAccount = z.infer<typeof demoAccountSchema>;

export const otpSchema = z.string().trim().regex(/^\d{6}$/, { error: 'validation.otp' });
export const passwordResetRequestSchema = z.object({ email: emailSchema, audience: audienceSchema, storefront: z.string().optional() });
export type PasswordResetRequest = z.input<typeof passwordResetRequestSchema>;
export const passwordResetSchema = z.object({ email: emailSchema, audience: audienceSchema, storefront: z.string().optional(), code: otpSchema, password: passwordSchema });
export type PasswordResetInput = z.input<typeof passwordResetSchema>;
/**
 * SIMULATION: the code is "emailed" through the outbox. `demoCode` echoes it so the prototype can be used without
 * a mailbox — the field does not exist in production and is the only place the code leaves the server.
 */
export const codeSentSchema = z.object({ sent: z.literal(true), expiresInMinutes: z.number().int(), demoCode: z.string().nullable() });
export type CodeSent = z.infer<typeof codeSentSchema>;

export const authOperations = {
  /** Always answers the same way whether or not the account exists (no account enumeration). */
  'auth.requestPasswordReset': op({ input: passwordResetRequestSchema, output: codeSentSchema, http: { method: 'POST', path: '/auth/password/forgot' }, auth: 'public' }),
  'auth.resetPassword': op({ input: passwordResetSchema, output: z.object({ ok: z.literal(true) }), http: { method: 'POST', path: '/auth/password/reset' }, auth: 'public' }),
  'auth.requestEmailVerification': op({ input: z.void(), output: codeSentSchema, http: { method: 'POST', path: '/auth/email/verify/request' }, auth: 'session' }),
  'auth.verifyEmail': op({ input: z.object({ code: otpSchema }), output: sessionDtoSchema, http: { method: 'POST', path: '/auth/email/verify' }, auth: 'session' }),
  'auth.login': op({ input: loginInputSchema, output: sessionDtoSchema, http: { method: 'POST', path: '/auth/login' }, auth: 'public' }),
  'auth.registerCustomer': op({ input: registerCustomerInputSchema, output: sessionDtoSchema, http: { method: 'POST', path: '/auth/register' }, auth: 'public' }),
  'auth.me': op({ input: z.void(), output: sessionDtoSchema, http: { method: 'GET', path: '/auth/me' }, auth: 'session' }),
  'auth.logout': op({ input: z.void(), output: z.object({ ok: z.literal(true) }), http: { method: 'POST', path: '/auth/logout' }, auth: 'session' }),
  'auth.switchOrg': op({ input: z.object({ tenantId: z.string() }), output: sessionDtoSchema, http: { method: 'POST', path: '/auth/switch-org' }, auth: 'session' }),
  'demo.accounts': op({ input: z.void(), output: z.array(demoAccountSchema), http: { method: 'GET', path: '/demo/accounts' }, auth: 'public', demoOnly: true }),
  'demo.loginAs': op({ input: z.object({ email: emailSchema, audience: audienceSchema }), output: sessionDtoSchema, http: { method: 'POST', path: '/demo/login-as' }, auth: 'public', demoOnly: true }),
} as const;
