import { z } from 'zod';
import { listQuerySchema, localizedTextSchema, minorAmountSchema } from '../primitives';
import { planLimitsSchema, planModuleSchema, subscriptionEntitySchema, subscriptionInvoiceEntitySchema, subscriptionPlanEntitySchema } from '../entities/subscriptions';
import { cardInputSchema } from './booking';
import { op } from './define';
import { pageOf } from './reference';

export const subscriptionUsageSchema = z.object({ users: z.number().int(), subAgencies: z.number().int(), bookingsThisMonth: z.number().int() });
export const subscriptionDtoSchema = subscriptionEntitySchema.extend({
  plan: subscriptionPlanEntitySchema,
  pendingPlan: subscriptionPlanEntitySchema.nullable(),
  orgName: z.string(),
  usage: subscriptionUsageSchema,
  /** Monthly recurring revenue equivalent (plan + add-on), for platform reporting. */
  mrrMinor: minorAmountSchema,
  daysLeftInTrial: z.number().int().nullable(),
  graceEndsAt: z.string().nullable(),
  writable: z.boolean(),
});
export type SubscriptionDto = z.infer<typeof subscriptionDtoSchema>;
export const mySubscriptionSchema = z.object({ subscription: subscriptionDtoSchema.nullable(), invoices: z.array(subscriptionInvoiceEntitySchema), canManage: z.boolean() });
export type MySubscription = z.infer<typeof mySubscriptionSchema>;

export const planInputSchema = z.object({
  id: z.string().optional(),
  key: z.string().regex(/^[a-z0-9_]+$/, { error: 'validation.invalid_value' }),
  name: localizedTextSchema,
  description: localizedTextSchema,
  monthlyMinor: z.number().int().min(0, { error: 'validation.must_be_positive' }),
  yearlyMinor: z.number().int().min(0, { error: 'validation.must_be_positive' }),
  limits: planLimitsSchema,
  modules: z.array(planModuleSchema),
  storefrontIncluded: z.boolean(),
  storefrontAddonMonthlyMinor: z.number().int().min(0),
  active: z.boolean(),
});
export type PlanInput = z.input<typeof planInputSchema>;

export const changePlanOutputSchema = z.object({ subscription: subscriptionDtoSchema, effective: z.enum(['now', 'period_end']), chargedMinor: minorAmountSchema });

export const subscriptionAccessSchema = z.object({
  /** null when the organization has no subscription (platform, suppliers, Travelta Direct). */
  planName: localizedTextSchema.nullable(),
  modules: z.array(planModuleSchema).nullable(),
  status: subscriptionEntitySchema.shape.status.nullable(),
  writable: z.boolean(),
  daysLeftInTrial: z.number().int().nullable(),
  graceEndsAt: z.string().nullable(),
  storefront: z.boolean(),
});
export type SubscriptionAccess = z.infer<typeof subscriptionAccessSchema>;

export const subscriptionOperations = {
  'subscriptions.access': op({ input: z.void(), output: subscriptionAccessSchema, http: { method: 'GET', path: '/subscription/access' }, auth: 'session' }),
  'subscriptions.plans': op({ input: z.void(), output: z.array(subscriptionPlanEntitySchema), http: { method: 'GET', path: '/subscriptions/plans' }, auth: 'session' }),
  'subscriptions.savePlan': op({ input: planInputSchema, output: subscriptionPlanEntitySchema, http: { method: 'POST', path: '/subscriptions/plans' }, auth: 'session' }),
  'subscriptions.mine': op({ input: z.void(), output: mySubscriptionSchema, http: { method: 'GET', path: '/subscription' }, auth: 'session' }),
  'subscriptions.list': op({ input: listQuerySchema, output: pageOf(subscriptionDtoSchema), http: { method: 'GET', path: '/subscriptions' }, auth: 'session' }),
  'subscriptions.changePlan': op({ input: z.object({ planId: z.string(), cycle: z.enum(['monthly', 'yearly']).optional() }), output: changePlanOutputSchema, http: { method: 'POST', path: '/subscription/plan' }, auth: 'session' }),
  'subscriptions.setAddon': op({ input: z.object({ storefront: z.boolean() }), output: changePlanOutputSchema, http: { method: 'POST', path: '/subscription/addons' }, auth: 'session' }),
  'subscriptions.setCancel': op({ input: z.object({ cancelAtPeriodEnd: z.boolean() }), output: subscriptionDtoSchema, http: { method: 'POST', path: '/subscription/cancel' }, auth: 'session' }),
  'subscriptions.updateCard': op({ input: cardInputSchema.omit({ threeDsCode: true }), output: subscriptionDtoSchema, http: { method: 'PUT', path: '/subscription/card' }, auth: 'session' }),
  'subscriptions.payNow': op({ input: z.void(), output: subscriptionDtoSchema, http: { method: 'POST', path: '/subscription/pay' }, auth: 'session' }),
  'subscriptions.adminAction': op({ input: z.object({ subscriptionId: z.string(), action: z.enum(['extend_trial', 'suspend', 'reactivate']) }), output: subscriptionDtoSchema, http: { method: 'POST', path: '/subscriptions/:subscriptionId/actions' }, auth: 'session' }),
  'subscriptions.invoices': op({ input: listQuerySchema, output: pageOf(subscriptionInvoiceEntitySchema.extend({ orgName: z.string() })), http: { method: 'GET', path: '/subscriptions/invoices' }, auth: 'session' }),
} as const;
