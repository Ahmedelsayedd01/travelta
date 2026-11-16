import { z } from 'zod';
import { currencySchema, isoDateSchema, listQuerySchema } from '../primitives';
import { inventorySourceSchema, markupModeSchema, serviceTypeSchema, supplierOwnershipSchema, unitTypeSchema } from '../enums';
import {
  commercialSettingsEntitySchema, customerTypeSchema, feeRuleEntitySchema, markupRuleEntitySchema, markupRuleVersionEntitySchema,
  priceBreakdownSchema, promoCodeEntitySchema, ruleMatchSchema, taxProfileEntitySchema,
} from '../entities/pricing';
import { pageOf } from './reference';
import { op } from './define';

export const markupRuleInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, { error: 'validation.too_short' }).max(120),
    status: z.enum(['active', 'inactive']),
    match: ruleMatchSchema,
    mode: markupModeSchema,
    value: z.number({ error: 'validation.required' }).min(0, { error: 'validation.must_be_positive' }).max(100_000),
    fixedCurrency: currencySchema.optional(),
    fixedPer: z.enum(['unit', 'booking']).optional(),
    minAmountMinor: z.number().int().min(0).optional(),
    maxAmountMinor: z.number().int().min(0).optional(),
    priority: z.number().int().min(0).max(1000),
  })
  .refine((r) => r.mode === 'percent' || (r.fixedCurrency && r.fixedPer), { error: 'validation.required', path: ['fixedCurrency'] })
  .refine((r) => r.minAmountMinor === undefined || r.maxAmountMinor === undefined || r.minAmountMinor <= r.maxAmountMinor, { error: 'validation.invalid_value', path: ['maxAmountMinor'] });
export type MarkupRuleInput = z.input<typeof markupRuleInputSchema>;

/** Scenario for the pricing simulator (PRICING_ENGINE §10). */
export const simulateInputSchema = z.object({
  serviceType: serviceTypeSchema,
  source: inventorySourceSchema,
  ownership: supplierOwnershipSchema,
  supplierId: z.string().optional(),
  productId: z.string().optional(),
  destinationId: z.string().optional(),
  nationalityGroupId: z.string().optional(),
  customerType: customerTypeSchema,
  channel: z.enum(['b2b', 'b2c']),
  netAmount: z.number().positive({ error: 'validation.must_be_positive' }),
  netCurrency: currencySchema,
  quantity: z.number().int().min(1).max(99),
  unitType: unitTypeSchema,
  targetCurrency: currencySchema,
  /** Platform only: simulate as a given agency / sub-agency. */
  agencyId: z.string().optional(),
  subAgencyId: z.string().optional(),
  travelDate: isoDateSchema,
  promoCode: z.string().optional(),
});
export type SimulateInput = z.input<typeof simulateInputSchema>;

export const layerResolutionSchema = z.object({
  layer: z.enum(['platform', 'agency', 'sub_agent']),
  ruleId: z.string().nullable(),
  ruleName: z.string().nullable(),
  score: z.number().int().nullable(),
  source: z.enum(['rule', 'default', 'skipped', 'hidden']),
  alsoMatched: z.array(z.object({ id: z.string(), name: z.string(), score: z.number().int() })),
});

export const simulateOutputSchema = z.object({
  breakdown: priceBreakdownSchema,
  audience: z.enum(['platform', 'agency', 'sub_agency']),
  resolution: z.array(layerResolutionSchema),
});
export type SimulateOutput = z.infer<typeof simulateOutputSchema>;

export const commercialSettingsInputSchema = commercialSettingsEntitySchema.pick({
  defaultMarkupPct: true, platformDefaults: true, childGuardrails: true, defaultGuardrail: true, fxBufferPct: true,
  rounding: true, maxDiscountPctByRole: true, defaultCreditLimitMinor: true, payLaterEnabled: true, cancellationAdminFeeMinor: true,
}).refine((s) => s.defaultGuardrail.minPct <= s.defaultGuardrail.maxPct, { error: 'validation.invalid_value', path: ['defaultGuardrail', 'maxPct'] });
export type CommercialSettingsInput = z.input<typeof commercialSettingsInputSchema>;

export const taxProfileInputSchema = taxProfileEntitySchema.pick({ name: true, serviceTypes: true, rateBp: true, inclusive: true, base: true }).extend({ id: z.string().optional() });
export const feeRuleInputSchema = feeRuleEntitySchema.pick({ name: true, serviceTypes: true, channel: true, mode: true, value: true, per: true, taxable: true, status: true }).extend({ id: z.string().optional() });
export const promoCodeInputSchema = promoCodeEntitySchema.pick({ code: true, mode: true, value: true, serviceTypes: true, validFrom: true, validTo: true, maxUses: true, status: true })
  .extend({ id: z.string().optional() })
  .refine((p) => p.validTo >= p.validFrom, { error: 'validation.invalid_date', path: ['validTo'] })
  .refine((p) => p.mode !== 'percent' || p.value <= 100, { error: 'validation.invalid_value', path: ['value'] });
export type TaxProfileInput = z.input<typeof taxProfileInputSchema>;
export type FeeRuleInput = z.input<typeof feeRuleInputSchema>;
export type PromoCodeInput = z.input<typeof promoCodeInputSchema>;

export const pricingOperations = {
  'pricing.rules.list': op({ input: listQuerySchema, output: pageOf(markupRuleEntitySchema), http: { method: 'GET', path: '/pricing/rules' }, auth: 'session' }),
  'pricing.rules.save': op({ input: markupRuleInputSchema, output: markupRuleEntitySchema, http: { method: 'PUT', path: '/pricing/rules' }, auth: 'session' }),
  'pricing.rules.versions': op({ input: z.object({ ruleId: z.string() }), output: z.array(markupRuleVersionEntitySchema), http: { method: 'GET', path: '/pricing/rules/:ruleId/versions' }, auth: 'session' }),
  'pricing.simulate': op({ input: simulateInputSchema, output: simulateOutputSchema, http: { method: 'POST', path: '/pricing/simulate' }, auth: 'session' }),
  'commercialSettings.get': op({ input: z.void(), output: commercialSettingsEntitySchema, http: { method: 'GET', path: '/commercial-settings' }, auth: 'session' }),
  'commercialSettings.update': op({ input: commercialSettingsInputSchema, output: commercialSettingsEntitySchema, http: { method: 'PUT', path: '/commercial-settings' }, auth: 'session' }),
  'pricing.taxProfiles.list': op({ input: z.void(), output: z.array(taxProfileEntitySchema), http: { method: 'GET', path: '/pricing/tax-profiles' }, auth: 'session' }),
  'pricing.taxProfiles.save': op({ input: taxProfileInputSchema, output: taxProfileEntitySchema, http: { method: 'PUT', path: '/pricing/tax-profiles' }, auth: 'session' }),
  'pricing.fees.list': op({ input: z.void(), output: z.array(feeRuleEntitySchema), http: { method: 'GET', path: '/pricing/fees' }, auth: 'session' }),
  'pricing.fees.save': op({ input: feeRuleInputSchema, output: feeRuleEntitySchema, http: { method: 'PUT', path: '/pricing/fees' }, auth: 'session' }),
  'promoCodes.list': op({ input: z.void(), output: z.array(promoCodeEntitySchema), http: { method: 'GET', path: '/promo-codes' }, auth: 'session' }),
  'promoCodes.save': op({ input: promoCodeInputSchema, output: promoCodeEntitySchema, http: { method: 'PUT', path: '/promo-codes' }, auth: 'session' }),
} as const;
