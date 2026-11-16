import { z } from 'zod';
import { emailSchema, localizedTextSchema } from '../primitives';
import { kycFileSchema } from '../entities/kyc';
import { hexColorSchema, storefrontEntitySchema } from '../entities/storefront';
import { op } from './define';

export const storefrontInputSchema = z.object({
  displayName: localizedTextSchema,
  tagline: localizedTextSchema,
  logo: kycFileSchema.nullable(),
  primaryColor: hexColorSchema,
  heroColor: hexColorSchema,
  subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/, { error: 'validation.subdomain' }),
  supportEmail: z.union([z.literal(''), emailSchema]).default(''),
  supportPhone: z.string().trim().max(30).default(''),
  showPoweredBy: z.boolean().default(true),
});
export type StorefrontInput = z.input<typeof storefrontInputSchema>;

export const storefrontDtoSchema = storefrontEntitySchema.extend({
  slug: z.string(),
  urls: z.object({ path: z.string(), subdomain: z.string(), custom: z.string().nullable() }),
  /** Contrast of each brand colour against white text (WCAG AA needs ≥ 4.5). */
  contrast: z.object({ primary: z.number(), hero: z.number() }),
  canManage: z.boolean(),
  /** SUB: the storefront add-on (or a plan that includes it) is required to publish. */
  entitled: z.boolean(),
  stats: z.object({ customers: z.number().int(), bookings: z.number().int(), salesMinor: z.number().int() }),
});
export type StorefrontDto = z.infer<typeof storefrontDtoSchema>;

/** What a visitor of `/s/<slug>` needs: branding only, never internal settings. */
export const publicStorefrontSchema = z.object({
  slug: z.string(), orgId: z.string(), orgName: localizedTextSchema, displayName: localizedTextSchema, tagline: localizedTextSchema, logoUrl: z.string().nullable(),
  primaryColor: hexColorSchema, heroColor: hexColorSchema, supportEmail: z.string(), supportPhone: z.string(), showPoweredBy: z.boolean(), currency: z.string(),
});
export type PublicStorefront = z.infer<typeof publicStorefrontSchema>;

export const storefrontOperations = {
  'storefront.get': op({ input: z.void(), output: storefrontDtoSchema, http: { method: 'GET', path: '/storefront' }, auth: 'session' }),
  'storefront.save': op({ input: storefrontInputSchema, output: storefrontDtoSchema, http: { method: 'PUT', path: '/storefront' }, auth: 'session' }),
  'storefront.setPublished': op({ input: z.object({ published: z.boolean() }), output: storefrontDtoSchema, http: { method: 'POST', path: '/storefront/publish' }, auth: 'session' }),
  'storefront.requestDomain': op({ input: z.object({ domain: z.string().trim().toLowerCase().regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, { error: 'validation.domain' }).nullable() }), output: storefrontDtoSchema, http: { method: 'POST', path: '/storefront/domain' }, auth: 'session' }),
  'storefront.simulateDns': op({ input: z.void(), output: storefrontDtoSchema, http: { method: 'POST', path: '/storefront/domain/simulate-dns' }, auth: 'session', demoOnly: false }),
  'storefront.verifyDomain': op({ input: z.void(), output: storefrontDtoSchema, http: { method: 'POST', path: '/storefront/domain/verify' }, auth: 'session' }),
  'storefront.public': op({ input: z.object({ slug: z.string().optional(), host: z.string().optional() }), output: publicStorefrontSchema, http: { method: 'GET', path: '/storefronts/public' }, auth: 'public' }),
} as const;
