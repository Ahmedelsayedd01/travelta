import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema } from '../primitives';
import { kycCaseStatusSchema, kycDocStatusSchema, kycDocTypeSchema, serviceTypeSchema } from '../enums';
import { tenantEntityBaseSchema } from './base';

/** Accepted upload formats and the prototype size cap (KYC-2). Production stores files in private object storage. */
export const KYC_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const KYC_MAX_FILE_BYTES = 1_500_000;

export const kycFileSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(KYC_FILE_TYPES, { error: 'validation.file_type' }),
  size: z.number().int().positive().max(KYC_MAX_FILE_BYTES, { error: 'validation.file_too_large' }),
  /** SIMULATION: file content kept as a data URL in the local dataset; null for seeded placeholders. */
  dataUrl: z.string().startsWith('data:').nullable(),
});
export type KycFile = z.infer<typeof kycFileSchema>;

/** One onboarding / compliance case per organization (KYC-3). */
export const kycCaseEntitySchema = tenantEntityBaseSchema.extend({
  status: kycCaseStatusSchema,
  submittedAt: isoDateTimeSchema.nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
});
export type KycCaseEntity = z.infer<typeof kycCaseEntitySchema>;

/** A document version; replacing a document creates a new version (the old one stays for the record). */
export const kycDocumentEntitySchema = tenantEntityBaseSchema.extend({
  caseId: z.string(),
  docType: kycDocTypeSchema,
  number: z.string().min(3).max(40),
  issueDate: isoDateSchema,
  expiryDate: isoDateSchema,
  file: kycFileSchema,
  status: kycDocStatusSchema,
  docVersion: z.number().int().min(1),
  current: z.boolean(),
  reviewNote: z.string().max(500).nullable(),
});
export type KycDocumentEntity = z.infer<typeof kycDocumentEntitySchema>;

/** Every decision is logged with the admin and time (proposal: replaces v1's single b2b_verification form). */
export const kycDecisionEntitySchema = tenantEntityBaseSchema.extend({
  caseId: z.string(),
  decision: z.enum(['approve', 'reject', 'request_changes', 'accept_document', 'reject_document']),
  reason: z.string().max(500).nullable(),
  documentId: z.string().nullable(),
  decidedBy: z.string(),
  at: isoDateTimeSchema,
});
export type KycDecisionEntity = z.infer<typeof kycDecisionEntitySchema>;

/** Supplier service lines need a second approval before stock goes live (KYC-6). */
export const serviceLineEntitySchema = tenantEntityBaseSchema.extend({
  serviceType: serviceTypeSchema,
  status: z.enum(['requested', 'approved', 'rejected']),
  decidedBy: z.string().nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  reason: z.string().max(500).nullable(),
});
export type ServiceLineEntity = z.infer<typeof serviceLineEntitySchema>;
