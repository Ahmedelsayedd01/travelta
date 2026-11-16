import { PERMISSION_KEYS, ROLE_TEMPLATE_KEYS, type Permission, type RoleTemplateKey } from '@travelta/contracts';
import { z } from 'zod';
import { currencySchema, emailSchema, isoDateTimeSchema, localeSchema, localizedTextSchema } from '../primitives';
import { kycCaseStatusSchema, orgStatusSchema, orgTypeSchema, serviceTypeSchema } from '../enums';
import { entityBaseSchema, tenantEntityBaseSchema } from './base';

export const permissionSchema = z.enum(PERMISSION_KEYS as [Permission, ...Permission[]]);
export const roleTemplateKeySchema = z.enum(ROLE_TEMPLATE_KEYS as [RoleTemplateKey, ...RoleTemplateKey[]]);

/** Tenant (DATABASE_DESIGN §1). Sub-agencies are agencies with `parentId`. */
export const organizationEntitySchema = entityBaseSchema.extend({
  type: orgTypeSchema,
  parentId: z.string().nullable(),
  name: localizedTextSchema,
  legalName: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  countryIso2: z.string().length(2),
  city: z.string().min(2),
  baseCurrency: currencySchema,
  status: orgStatusSchema,
  kycStatus: kycCaseStatusSchema,
  /** Supplier service lines (requested/approved lines are tracked by KYC in M7). */
  serviceTypes: z.array(serviceTypeSchema),
  /** The platform's own retail seller (Travelta Direct) — acts as the agency layer for platform B2C sales (PRC-6). */
  isPlatformRetail: z.boolean(),
  contactEmail: emailSchema,
  contactPhone: z.string(),
});
export type OrganizationEntity = z.infer<typeof organizationEntitySchema>;

export const userEntitySchema = entityBaseSchema.extend({
  email: emailSchema,
  name: z.string().min(2).max(120),
  phone: z.string().nullable(),
  locale: localeSchema,
  userType: z.enum(['staff', 'customer']),
  status: z.enum(['active', 'invited', 'disabled']),
  /** SIMULATION ONLY: non-cryptographic hash. Real hashing (argon2/bcrypt) happens server-side in production. */
  passwordHash: z.string(),
  /** Customers belong to the selling organization whose storefront they registered on (TENANCY §1). */
  sellerTenantId: z.string().nullable(),
  lastLoginAt: isoDateTimeSchema.nullable(),
  /** Null until the user confirms the one-time code sent to their email. */
  emailVerifiedAt: isoDateTimeSchema.nullable(),
});
export type UserEntity = z.infer<typeof userEntitySchema>;

export const roleEntitySchema = tenantEntityBaseSchema.extend({
  key: z.string().min(2).max(60),
  name: localizedTextSchema,
  isSystem: z.boolean(),
  template: roleTemplateKeySchema.nullable(),
  permissions: z.array(permissionSchema),
});
export type RoleEntity = z.infer<typeof roleEntitySchema>;

export const membershipEntitySchema = tenantEntityBaseSchema.extend({
  userId: z.string(),
  roleId: z.string(),
  status: z.enum(['active', 'disabled']),
});
export type MembershipEntity = z.infer<typeof membershipEntitySchema>;

export const sessionEntitySchema = entityBaseSchema.extend({
  token: z.string().min(32),
  userId: z.string(),
  /** Active organization (staff) or seller organization (customers). */
  tenantId: z.string(),
  audience: z.enum(['staff', 'customer']),
  expiresAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
});
export type SessionEntity = z.infer<typeof sessionEntitySchema>;

export const auditLogEntitySchema = tenantEntityBaseSchema.extend({
  actorUserId: z.string().nullable(),
  action: z.string().min(3),
  entity: z.string().min(2),
  entityId: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  at: isoDateTimeSchema,
});
export type AuditLogEntity = z.infer<typeof auditLogEntitySchema>;

/** One-time codes for password reset and email verification (SIMULATION: delivered through the email outbox). */
export const authCodeEntitySchema = entityBaseSchema.extend({
  userId: z.string(),
  purpose: z.enum(['password_reset', 'email_verify']),
  /** Codes are stored hashed, like passwords. */
  codeHash: z.string(),
  expiresAt: isoDateTimeSchema,
  attempts: z.number().int().min(0),
  usedAt: isoDateTimeSchema.nullable(),
});
export type AuthCodeEntity = z.infer<typeof authCodeEntitySchema>;
