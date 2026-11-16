import { z } from 'zod';
import { currencySchema, isoDateSchema, isoDateTimeSchema, listQuerySchema, minorAmountSchema } from '../primitives';
import { manualItemInputSchema } from '../entities/booking';
import {
  activityEntitySchema, crmEntityRefSchema, crmRequestEntitySchema, crmSourceSchema, FOLLOW_UP_TYPES, followUpEntitySchema, leadEntitySchema,
  quotationEntitySchema,
} from '../entities/crm';
import { prioritySchema, requestStageSchema, serviceTypeSchema } from '../enums';
import { bookingListItemSchema, customerInputSchema } from './booking';
import { paymentListItemSchema } from './finance';
import { op } from './define';
import { pageOf } from './reference';
import { customerEntitySchema } from '../entities/booking';

const text = (min: number, max: number) => z.string().trim().min(min, { error: min <= 1 ? 'validation.required' : 'validation.too_short' }).max(max, { error: 'validation.too_long' });

export const leadInputSchema = z.object({
  id: z.string().optional(),
  name: text(2, 120),
  email: z.union([z.literal(''), z.email({ error: 'validation.invalid_email' })]).default(''),
  phone: z.string().trim().max(30).default(''),
  source: crmSourceSchema.default('walk_in'),
  ownerUserId: z.string().optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  notes: z.string().max(2000).default(''),
}).refine((l) => l.email !== '' || l.phone !== '', { error: 'validation.contact_required', path: ['phone'] });
export type LeadInput = z.input<typeof leadInputSchema>;

export const requestInputSchema = z.object({
  id: z.string().optional(),
  leadId: z.string().nullable().default(null),
  customerId: z.string().nullable().default(null),
  title: text(2, 160),
  serviceType: serviceTypeSchema,
  destination: z.string().trim().max(120).default(''),
  from: isoDateSchema,
  to: isoDateSchema.nullable().default(null),
  adults: z.number().int().min(1, { error: 'validation.must_be_positive' }).max(50),
  children: z.number().int().min(0).max(20).default(0),
  infants: z.number().int().min(0).max(10).default(0),
  priority: prioritySchema.default('medium'),
  expectedRevenueMinor: z.number().int().min(0).default(0),
  assigneeUserId: z.string().optional(),
  notes: z.string().max(2000).default(''),
}).refine((r) => r.leadId !== null || r.customerId !== null, { error: 'validation.lead_or_customer', path: ['customerId'] })
  .refine((r) => r.to === null || r.to >= r.from, { error: 'validation.invalid_date', path: ['to'] });
export type RequestInput = z.input<typeof requestInputSchema>;

export const leadListItemSchema = leadEntitySchema.extend({ ownerName: z.string(), openRequests: z.number().int(), nextFollowUpAt: isoDateTimeSchema.nullable() });
export type LeadListItem = z.infer<typeof leadListItemSchema>;

export const requestCardSchema = crmRequestEntitySchema.extend({
  partyName: z.string(), assigneeName: z.string(), quotationTotalMinor: minorAmountSchema.nullable(), overdueFollowUps: z.number().int(),
  /** CRM-1 moves allowed from the current stage. */
  moves: z.array(requestStageSchema), canEdit: z.boolean(),
});
export type RequestCard = z.infer<typeof requestCardSchema>;

export const followUpListItemSchema = followUpEntitySchema.extend({ entityLabel: z.string(), assigneeName: z.string(), overdue: z.boolean() });
export type FollowUpListItem = z.infer<typeof followUpListItemSchema>;
export const activityDtoSchema = activityEntitySchema.extend({ actorName: z.string() });
export type ActivityDto = z.infer<typeof activityDtoSchema>;

export const requestDetailSchema = z.object({
  request: requestCardSchema,
  lead: leadEntitySchema.nullable(),
  customer: customerEntitySchema.nullable(),
  quotations: z.array(quotationEntitySchema),
  followUps: z.array(followUpListItemSchema),
  activities: z.array(activityDtoSchema),
  booking: bookingListItemSchema.nullable(),
});
export type RequestDetail = z.infer<typeof requestDetailSchema>;

export const quotationInputSchema = z.object({
  requestId: z.string(),
  lines: z.array(manualItemInputSchema).min(1, { error: 'validation.required' }).max(10),
  validUntil: isoDateSchema,
  notes: z.string().max(1000).default(''),
});
export type QuotationInput = z.input<typeof quotationInputSchema>;

export const followUpInputSchema = z.object({
  entity: crmEntityRefSchema,
  type: z.enum(FOLLOW_UP_TYPES),
  dueAt: isoDateTimeSchema,
  note: z.string().trim().max(500).default(''),
  assigneeUserId: z.string().optional(),
});

export const customer360Schema = z.object({
  customer: customerEntitySchema,
  leads: z.array(leadEntitySchema),
  requests: z.array(requestCardSchema),
  bookings: z.array(bookingListItemSchema),
  payments: z.array(paymentListItemSchema),
  followUps: z.array(followUpListItemSchema),
  activities: z.array(activityDtoSchema),
  totals: z.object({ bookedMinor: minorAmountSchema, paidMinor: minorAmountSchema, outstandingMinor: minorAmountSchema, currency: currencySchema, bookings: z.number().int(), openRequests: z.number().int() }),
});
export type Customer360 = z.infer<typeof customer360Schema>;

export const crmUserSchema = z.object({ id: z.string(), name: z.string() });

export const crmOperations = {
  'crm.users': op({ input: z.void(), output: z.array(crmUserSchema), http: { method: 'GET', path: '/crm/users' }, auth: 'session' }),
  'crm.leads.list': op({ input: listQuerySchema, output: pageOf(leadListItemSchema), http: { method: 'GET', path: '/crm/leads' }, auth: 'session' }),
  'crm.leads.save': op({ input: leadInputSchema, output: leadEntitySchema, http: { method: 'POST', path: '/crm/leads' }, auth: 'session' }),
  'crm.leads.setStatus': op({ input: z.object({ id: z.string(), status: z.enum(['new', 'contacted', 'qualified', 'lost']), reason: z.string().max(300).optional() }), output: leadEntitySchema, http: { method: 'POST', path: '/crm/leads/:id/status' }, auth: 'session' }),
  'crm.leads.convert': op({ input: z.object({ id: z.string(), customer: customerInputSchema.optional() }), output: customerEntitySchema, http: { method: 'POST', path: '/crm/leads/:id/convert' }, auth: 'session' }),

  'crm.requests.list': op({ input: listQuerySchema, output: pageOf(requestCardSchema), http: { method: 'GET', path: '/crm/requests' }, auth: 'session' }),
  'crm.requests.get': op({ input: z.object({ id: z.string() }), output: requestDetailSchema, http: { method: 'GET', path: '/crm/requests/:id' }, auth: 'session' }),
  'crm.requests.save': op({ input: requestInputSchema, output: requestCardSchema, http: { method: 'POST', path: '/crm/requests' }, auth: 'session' }),
  'crm.requests.move': op({ input: z.object({ id: z.string(), stage: requestStageSchema, reason: z.string().max(300).optional() }), output: requestCardSchema, http: { method: 'POST', path: '/crm/requests/:id/stage' }, auth: 'session' }),
  'crm.requests.win': op({ input: z.object({ id: z.string(), quotationId: z.string() }), output: z.object({ customerId: z.string(), cartItems: z.number().int(), requestId: z.string() }), http: { method: 'POST', path: '/crm/requests/:id/win' }, auth: 'session' }),

  'crm.quotations.save': op({ input: quotationInputSchema, output: quotationEntitySchema, http: { method: 'POST', path: '/crm/requests/:requestId/quotations' }, auth: 'session' }),
  'crm.quotations.send': op({ input: z.object({ id: z.string(), via: z.enum(['email', 'whatsapp']) }), output: quotationEntitySchema, http: { method: 'POST', path: '/crm/quotations/:id/send' }, auth: 'session' }),
  'crm.quotations.decide': op({ input: z.object({ id: z.string(), decision: z.enum(['accepted', 'rejected']) }), output: quotationEntitySchema, http: { method: 'POST', path: '/crm/quotations/:id/decision' }, auth: 'session' }),

  'crm.followUps.list': op({ input: listQuerySchema, output: pageOf(followUpListItemSchema), http: { method: 'GET', path: '/crm/follow-ups' }, auth: 'session' }),
  'crm.followUps.save': op({ input: followUpInputSchema, output: followUpListItemSchema, http: { method: 'POST', path: '/crm/follow-ups' }, auth: 'session' }),
  'crm.followUps.complete': op({ input: z.object({ id: z.string(), outcome: z.string().trim().max(500).default('') }), output: followUpListItemSchema, http: { method: 'POST', path: '/crm/follow-ups/:id/complete' }, auth: 'session' }),
  'crm.notes.add': op({ input: z.object({ entity: crmEntityRefSchema, text: text(1, 1000) }), output: activityDtoSchema, http: { method: 'POST', path: '/crm/notes' }, auth: 'session' }),

  'customers.get360': op({ input: z.object({ id: z.string() }), output: customer360Schema, http: { method: 'GET', path: '/customers/:id/360' }, auth: 'session' }),
} as const;
