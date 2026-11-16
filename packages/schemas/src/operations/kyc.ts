import { z } from 'zod';
import { emailSchema, isoDateSchema, isoDateTimeSchema, listQuerySchema, localizedTextSchema, passwordSchema, phoneSchema, requiredText } from '../primitives';
import { kycCaseStatusSchema, kycDocTypeSchema, orgStatusSchema, orgTypeSchema, serviceTypeSchema } from '../enums';
import { kycDecisionEntitySchema, kycDocumentEntitySchema, kycFileSchema, serviceLineEntitySchema } from '../entities/kyc';
import { sessionDtoSchema } from './auth';
import { pageOf } from './reference';
import { op } from './define';

/** Business sign-up, step 1 of onboarding (W1): company + owner account. Step 2 is the KYC document upload. */
export const registerBusinessInputSchema = z
  .object({
    orgType: z.enum(['agency', 'supplier']),
    company: z.object({
      name: localizedTextSchema,
      legalName: requiredText(160),
      countryIso2: z.string().length(2),
      city: requiredText(80),
      contactEmail: emailSchema,
      contactPhone: phoneSchema,
    }),
    owner: z.object({ name: requiredText(120), email: emailSchema, password: passwordSchema }),
    /** Suppliers choose the service lines they want to sell (second approval required, KYC-6). */
    serviceTypes: z.array(serviceTypeSchema),
    acceptTerms: z.literal(true, { error: 'validation.accept_terms' }),
  })
  .refine((v) => v.orgType !== 'supplier' || v.serviceTypes.length > 0, { error: 'validation.required', path: ['serviceTypes'] });
export type RegisterBusinessInput = z.input<typeof registerBusinessInputSchema>;

export const uploadDocumentInputSchema = z
  .object({
    docType: kycDocTypeSchema,
    number: z.string().trim().min(3, { error: 'validation.too_short' }).max(40, { error: 'validation.too_long' }),
    issueDate: isoDateSchema,
    expiryDate: isoDateSchema,
    file: kycFileSchema,
  })
  .refine((d) => d.expiryDate > d.issueDate, { error: 'validation.expiry_before_issue', path: ['expiryDate'] });
export type UploadDocumentInput = z.input<typeof uploadDocumentInputSchema>;

export const kycDocumentDtoSchema = kycDocumentEntitySchema.extend({
  /** Days until expiry relative to the demo clock (negative = expired). */
  daysToExpiry: z.number().int(),
  expiringSoon: z.boolean(),
});
export type KycDocumentDto = z.infer<typeof kycDocumentDtoSchema>;

export const kycCaseDtoSchema = z.object({
  id: z.string(),
  status: kycCaseStatusSchema,
  submittedAt: isoDateTimeSchema.nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  organization: z.object({ id: z.string(), type: orgTypeSchema, name: localizedTextSchema, legalName: z.string(), status: orgStatusSchema, city: z.string() }),
  documents: z.array(kycDocumentDtoSchema),
  history: z.array(kycDocumentDtoSchema),
  decisions: z.array(kycDecisionEntitySchema.extend({ decidedByName: z.string() })),
  serviceLines: z.array(serviceLineEntitySchema),
  missing: z.array(kycDocTypeSchema),
  canSubmit: z.boolean(),
  /** Warning threshold (KYC-5): documents expiring within 30 days. */
  warnings: z.array(z.object({ docType: kycDocTypeSchema, daysToExpiry: z.number().int() })),
});
export type KycCaseDto = z.infer<typeof kycCaseDtoSchema>;

export const kycQueueItemSchema = z.object({
  caseId: z.string(),
  organization: kycCaseDtoSchema.shape.organization,
  status: kycCaseStatusSchema,
  submittedAt: isoDateTimeSchema.nullable(),
  pendingDocuments: z.number().int(),
  pendingServiceLines: z.number().int(),
  ageDays: z.number().int(),
});
export type KycQueueItem = z.infer<typeof kycQueueItemSchema>;

export const kycOperations = {
  'onboarding.registerBusiness': op({ input: registerBusinessInputSchema, output: sessionDtoSchema, http: { method: 'POST', path: '/onboarding/business' }, auth: 'public' }),
  'kyc.myCase': op({ input: z.void(), output: kycCaseDtoSchema, http: { method: 'GET', path: '/kyc/me' }, auth: 'session' }),
  'kyc.uploadDocument': op({ input: uploadDocumentInputSchema, output: kycCaseDtoSchema, http: { method: 'POST', path: '/kyc/me/documents' }, auth: 'session' }),
  'kyc.submit': op({ input: z.void(), output: kycCaseDtoSchema, http: { method: 'POST', path: '/kyc/me/submit' }, auth: 'session' }),
  'kyc.queue': op({ input: listQuerySchema, output: pageOf(kycQueueItemSchema), http: { method: 'GET', path: '/kyc/cases' }, auth: 'session' }),
  'kyc.getCase': op({ input: z.object({ caseId: z.string() }), output: kycCaseDtoSchema, http: { method: 'GET', path: '/kyc/cases/:caseId' }, auth: 'session' }),
  'kyc.reviewDocument': op({
    input: z.object({ documentId: z.string(), status: z.enum(['accepted', 'rejected']), note: z.string().max(500).optional() }),
    output: kycCaseDtoSchema, http: { method: 'POST', path: '/kyc/documents/:documentId/review' }, auth: 'session',
  }),
  'kyc.decide': op({
    input: z.object({ caseId: z.string(), decision: z.enum(['approve', 'reject', 'request_changes']), reason: z.string().max(500).optional() })
      .refine((d) => d.decision === 'approve' || (d.reason?.trim().length ?? 0) > 0, { error: 'validation.required', path: ['reason'] }),
    output: kycCaseDtoSchema, http: { method: 'POST', path: '/kyc/cases/:caseId/decision' }, auth: 'session',
  }),
  'kyc.decideServiceLine': op({
    input: z.object({ serviceLineId: z.string(), approve: z.boolean(), reason: z.string().max(500).optional() }),
    output: kycCaseDtoSchema, http: { method: 'POST', path: '/kyc/service-lines/:serviceLineId/decision' }, auth: 'session',
  }),
  'kyc.requestServiceLine': op({ input: z.object({ serviceType: serviceTypeSchema }), output: kycCaseDtoSchema, http: { method: 'POST', path: '/kyc/me/service-lines' }, auth: 'session' }),
} as const;
