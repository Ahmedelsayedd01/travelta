import { z } from 'zod';
import { currencySchema, isoDateSchema, isoDateTimeSchema, localizedTextSchema, minorAmountSchema } from '../primitives';
import { leadStatusSchema, prioritySchema, requestStageSchema, serviceTypeSchema } from '../enums';
import { tenantEntityBaseSchema } from './base';
import { customerEntitySchema, manualItemInputSchema } from './booking';

// ---- CRM (W4, CRM-1..4) --------------------------------------------------------------------------------------------
export const crmSourceSchema = customerEntitySchema.shape.source;

export const leadEntitySchema = tenantEntityBaseSchema.extend({
  name: z.string().min(2).max(120),
  email: z.string().max(160),
  phone: z.string().max(30),
  source: crmSourceSchema,
  ownerUserId: z.string(),
  status: leadStatusSchema,
  /** CRM-3: set when the lead becomes a customer (first booking or conversion). */
  customerId: z.string().nullable(),
  lostReason: z.string().max(300).nullable(),
  tags: z.array(z.string().max(30)).max(10),
  notes: z.string().max(2000),
});
export type LeadEntity = z.infer<typeof leadEntitySchema>;

export const crmRequestEntitySchema = tenantEntityBaseSchema.extend({
  ref: z.string(),
  leadId: z.string().nullable(),
  customerId: z.string().nullable(),
  title: z.string().min(2).max(160),
  serviceType: serviceTypeSchema,
  destination: z.string().max(120),
  from: isoDateSchema,
  to: isoDateSchema.nullable(),
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(20),
  infants: z.number().int().min(0).max(10),
  priority: prioritySchema,
  expectedRevenueMinor: minorAmountSchema,
  currency: currencySchema,
  stage: requestStageSchema,
  stageChangedAt: isoDateTimeSchema,
  assigneeUserId: z.string(),
  lostReason: z.string().max(300).nullable(),
  /** CRM-2: the booking created when the request is won. */
  bookingId: z.string().nullable(),
  notes: z.string().max(2000),
});
export type CrmRequestEntity = z.infer<typeof crmRequestEntitySchema>;

/** A quotation line keeps the manual-item input (supplier, cost, markup) and its engine price at the time of quoting. */
export const quotationLineSchema = z.object({
  item: manualItemInputSchema,
  title: localizedTextSchema,
  supplierName: z.string(),
  sellMinor: minorAmountSchema,
  taxMinor: minorAmountSchema,
  costMinor: minorAmountSchema,
});
export type QuotationLine = z.infer<typeof quotationLineSchema>;

export const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'superseded'] as const;
export const quotationEntitySchema = tenantEntityBaseSchema.extend({
  requestId: z.string(),
  number: z.string(),
  /** Quotation revision for the request (v1, v2 …); `version` remains the row version. */
  revision: z.number().int().min(1),
  lines: z.array(quotationLineSchema).min(1),
  totalMinor: minorAmountSchema,
  costMinor: minorAmountSchema,
  currency: currencySchema,
  validUntil: isoDateSchema,
  status: z.enum(QUOTATION_STATUSES),
  sentAt: isoDateTimeSchema.nullable(),
  sentVia: z.enum(['email', 'whatsapp']).nullable(),
  notes: z.string().max(1000),
  createdByUserId: z.string(),
});
export type QuotationEntity = z.infer<typeof quotationEntitySchema>;

export const FOLLOW_UP_TYPES = ['call', 'whatsapp', 'email', 'meeting'] as const;
export const crmEntityRefSchema = z.object({ kind: z.enum(['lead', 'request', 'customer']), id: z.string() });
export type CrmEntityRef = z.infer<typeof crmEntityRefSchema>;

export const followUpEntitySchema = tenantEntityBaseSchema.extend({
  entity: crmEntityRefSchema,
  type: z.enum(FOLLOW_UP_TYPES),
  dueAt: isoDateTimeSchema,
  note: z.string().max(500),
  assigneeUserId: z.string(),
  doneAt: isoDateTimeSchema.nullable(),
  outcome: z.string().max(500).nullable(),
});
export type FollowUpEntity = z.infer<typeof followUpEntitySchema>;

export const ACTIVITY_KINDS = ['created', 'note', 'stage', 'quotation', 'follow_up', 'booking', 'converted', 'assigned'] as const;
export const activityEntitySchema = tenantEntityBaseSchema.extend({
  entity: crmEntityRefSchema,
  /** Customer 360 also collects activities of the customer's leads and requests. */
  customerId: z.string().nullable(),
  kind: z.enum(ACTIVITY_KINDS),
  text: z.string().max(1000),
  actorUserId: z.string().nullable(),
  at: isoDateTimeSchema,
});
export type ActivityEntity = z.infer<typeof activityEntitySchema>;
