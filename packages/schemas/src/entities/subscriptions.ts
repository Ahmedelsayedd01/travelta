import { z } from 'zod';
import { currencySchema, isoDateSchema, isoDateTimeSchema, localizedTextSchema, minorAmountSchema } from '../primitives';
import { entityBaseSchema, tenantEntityBaseSchema } from './base';

// ---- SaaS subscriptions (SUB-1..4) — prices and limits are DEMO values, editable by the platform -------------------------
export const PLAN_MODULES = ['crm', 'accounting', 'sub_agencies'] as const;
export const planModuleSchema = z.enum(PLAN_MODULES);
export type PlanModule = z.infer<typeof planModuleSchema>;
export const SUBSCRIPTION_STATES = ['trialing', 'active', 'past_due', 'suspended', 'cancelled'] as const;

export const planLimitsSchema = z.object({
  /** null = unlimited. */
  users: z.number().int().positive().nullable(),
  subAgencies: z.number().int().min(0).nullable(),
  bookingsPerMonth: z.number().int().positive().nullable(),
});

export const subscriptionPlanEntitySchema = entityBaseSchema.extend({
  key: z.string().regex(/^[a-z0-9_]+$/),
  name: localizedTextSchema,
  description: localizedTextSchema,
  monthlyMinor: minorAmountSchema,
  yearlyMinor: minorAmountSchema,
  currency: currencySchema,
  limits: planLimitsSchema,
  modules: z.array(planModuleSchema),
  /** Storefront is sold as an add-on (SUB-1); some plans include it. */
  storefrontIncluded: z.boolean(),
  storefrontAddonMonthlyMinor: minorAmountSchema,
  active: z.boolean(),
  sort: z.number().int(),
  isDemoValue: z.boolean(),
});
export type SubscriptionPlanEntity = z.infer<typeof subscriptionPlanEntitySchema>;

export const subscriptionEntitySchema = tenantEntityBaseSchema.extend({
  planId: z.string(),
  cycle: z.enum(['monthly', 'yearly']),
  status: z.enum(SUBSCRIPTION_STATES),
  trialEndsAt: isoDateSchema.nullable(),
  currentPeriodStart: isoDateSchema,
  currentPeriodEnd: isoDateSchema,
  pastDueSince: isoDateSchema.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  /** SUB-4: downgrades wait for the period end. */
  pendingPlanId: z.string().nullable(),
  storefrontAddon: z.boolean(),
  /** SIMULATION: card on file; `failing` makes the next charge decline (test card 4000 0000 0000 0002). */
  card: z.object({ last4: z.string().length(4), brand: z.string(), failing: z.boolean() }).nullable(),
});
export type SubscriptionEntity = z.infer<typeof subscriptionEntitySchema>;

export const subscriptionInvoiceEntitySchema = tenantEntityBaseSchema.extend({
  subscriptionId: z.string(),
  number: z.string(),
  kind: z.enum(['renewal', 'trial_conversion', 'upgrade', 'addon', 'retry']),
  lines: z.array(z.object({ description: z.string(), amountMinor: z.number().int() })),
  totalMinor: minorAmountSchema,
  currency: currencySchema,
  status: z.enum(['paid', 'failed']),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  issuedAt: isoDateTimeSchema,
  cardLast4: z.string().nullable(),
});
export type SubscriptionInvoiceEntity = z.infer<typeof subscriptionInvoiceEntitySchema>;
