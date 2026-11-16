import { z } from 'zod';
import { isoDateTimeSchema, localizedTextSchema } from '../primitives';
import { tenantEntityBaseSchema } from './base';
import { kycFileSchema } from './kyc';

// ---- Agency-branded storefronts (M22) ---------------------------------------------------------------------------------------
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'validation.hex_color' });
export const DOMAIN_STATUSES = ['none', 'pending', 'verified', 'failed'] as const;

export const storefrontEntitySchema = tenantEntityBaseSchema.extend({
  published: z.boolean(),
  displayName: localizedTextSchema,
  tagline: localizedTextSchema,
  logo: kycFileSchema.nullable(),
  /** Buttons and links; must reach 4.5:1 against white text (WCAG AA). */
  primaryColor: hexColorSchema,
  /** Hero background; must reach 4.5:1 against white text. */
  heroColor: hexColorSchema,
  /** `<subdomain>.travelta.app` (and `<subdomain>.localhost` in the prototype). */
  subdomain: z.string().regex(/^[a-z0-9-]{3,40}$/),
  customDomain: z.string().nullable(),
  domainStatus: z.enum(DOMAIN_STATUSES),
  /** SIMULATION: the TXT token the agency must publish, and whether the simulated DNS has it. */
  verificationToken: z.string().nullable(),
  dnsRecordPresent: z.boolean(),
  domainCheckedAt: isoDateTimeSchema.nullable(),
  supportEmail: z.string().max(160),
  supportPhone: z.string().max(30),
  showPoweredBy: z.boolean(),
});
export type StorefrontEntity = z.infer<typeof storefrontEntitySchema>;
