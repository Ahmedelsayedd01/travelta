import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema } from '../primitives';
import { entityBaseSchema } from './base';

/** A customer's saved traveller (themselves, family, friends) — reused to fill checkout traveller details. */
export const savedTravelerEntitySchema = entityBaseSchema.extend({
  userId: z.string(),
  type: z.enum(['adult', 'child', 'infant']),
  title: z.enum(['mr', 'mrs', 'ms', 'miss', 'mstr']),
  firstName: z.string().trim().min(1, { error: 'validation.required' }).max(60),
  lastName: z.string().trim().min(1, { error: 'validation.required' }).max(60),
  dateOfBirth: isoDateSchema.nullable(),
  nationalityIso2: z.string().length(2).nullable(),
  passportNo: z.string().trim().max(20).nullable(),
  passportExpiry: isoDateSchema.nullable(),
});
export type SavedTravelerEntity = z.infer<typeof savedTravelerEntitySchema>;

/** Support request from a storefront customer; the reference (SUP-00001) is per seller. */
export const SUPPORT_TOPICS = ['booking', 'payment', 'cancellation', 'other'] as const;
export const supportTicketEntitySchema = entityBaseSchema.extend({
  tenantId: z.string(),
  userId: z.string(),
  ref: z.string(),
  topic: z.enum(SUPPORT_TOPICS),
  bookingId: z.string().nullable(),
  message: z.string(),
  /** Prototype: there is no staff ticket queue yet, so tickets stay open; replies arrive by email (outbox). */
  status: z.enum(['open', 'closed']),
  at: isoDateTimeSchema,
});
export type SupportTicketEntity = z.infer<typeof supportTicketEntitySchema>;
