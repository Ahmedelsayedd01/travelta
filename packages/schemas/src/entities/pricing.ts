import { z } from 'zod';
import { currencySchema, isoDateSchema, isoDateTimeSchema } from '../primitives';
import { inventorySourceSchema, markupLayerSchema, markupModeSchema, serviceTypeSchema, supplierOwnershipSchema, unitTypeSchema } from '../enums';
import { entityBaseSchema, tenantEntityBaseSchema } from './base';

export const customerTypeSchema = z.enum(['individual', 'corporate', 'sub_agent', 'vip']);
export type CustomerType = z.infer<typeof customerTypeSchema>;

/** Match criteria of a markup rule (PRICING_ENGINE §4). Empty/omitted = wildcard. */
export const ruleMatchSchema = z.object({
  serviceTypes: z.array(serviceTypeSchema).optional(),
  sources: z.array(inventorySourceSchema).optional(),
  supplierIds: z.array(z.string()).optional(),
  /** Platform rules: specific agencies. Agency rules: specific sub-agencies. */
  targetAgencyIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
  destinationIds: z.array(z.string()).optional(),
  nationalityGroupIds: z.array(z.string()).optional(),
  customerTypes: z.array(customerTypeSchema).optional(),
  channel: z.enum(['b2b', 'b2c']).optional(),
  bookingWindow: z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() }).optional(),
  travelWindow: z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() }).optional(),
});
export type RuleMatch = z.infer<typeof ruleMatchSchema>;

export const markupRuleEntitySchema = tenantEntityBaseSchema.extend({
  /** Rule version: edits create version n+1; bookings reference (id, ruleVersion) (PRC-14). */
  ruleVersion: z.number().int().min(1),
  layer: markupLayerSchema,
  name: z.string().min(2).max(120),
  status: z.enum(['active', 'inactive']),
  match: ruleMatchSchema,
  mode: markupModeSchema,
  /** Percent (e.g. 8 = 8%) or fixed amount in major units of `fixedCurrency`. */
  value: z.number().min(0).max(100_000),
  fixedCurrency: currencySchema.optional(),
  fixedPer: z.enum(['unit', 'booking']).optional(),
  /** Per-unit floor/ceiling in minor units of the pricing currency (converted from fixedCurrency when needed). */
  minAmountMinor: z.number().int().min(0).optional(),
  maxAmountMinor: z.number().int().min(0).optional(),
  priority: z.number().int().min(0).max(1000),
  isDemoValue: z.boolean(),
});
export type MarkupRuleEntity = z.infer<typeof markupRuleEntitySchema>;

export const markupRuleVersionEntitySchema = entityBaseSchema.extend({ ruleId: z.string(), ruleVersion: z.number().int(), snapshot: markupRuleEntitySchema, changedBy: z.string().nullable() });
export type MarkupRuleVersionEntity = z.infer<typeof markupRuleVersionEntitySchema>;

export const roundingSchema = z.object({
  mode: z.enum(['none', 'nearest', 'up', 'down']),
  /** Increment in minor units (100 = 1.00). */
  incrementMinor: z.number().int().min(1).max(100_000),
  /** Optional charm ending in minor units (e.g. 99 → x.99). */
  charmMinor: z.number().int().min(0).max(99).nullable(),
});
export type RoundingRule = z.infer<typeof roundingSchema>;

export const percentRangeSchema = z.object({ minPct: z.number().min(0).max(1000), maxPct: z.number().min(0).max(1000) });

/**
 * Commercial settings per tenant (PRC-13): every commercial number lives here or in rules — never in code.
 * All seeded values are DEMO values.
 */
export const commercialSettingsEntitySchema = tenantEntityBaseSchema.extend({
  /** Default markup % for this tenant's own layer when no rule matches. Platform: by supplier ownership. */
  defaultMarkupPct: z.number().min(0).max(1000),
  platformDefaults: z.object({ apiPct: z.number().min(0).max(1000), networkPct: z.number().min(0).max(1000) }).nullable(),
  /** Allowed markup range for the tier BELOW (platform → agencies, agency → sub-agencies). */
  childGuardrails: z.partialRecord(serviceTypeSchema, percentRangeSchema),
  defaultGuardrail: percentRangeSchema,
  fxBufferPct: z.number().min(0).max(10),
  rounding: z.partialRecord(currencySchema, roundingSchema),
  /** Max manual discount % per role key. */
  maxDiscountPctByRole: z.record(z.string(), z.number().min(0).max(100)),
  defaultCreditLimitMinor: z.number().int().min(0).nullable(),
  /** PAY-6: storefront customers may book now and pay later. */
  payLaterEnabled: z.boolean(),
  /** CAN-2: optional admin fee added to customer cancellations. */
  cancellationAdminFeeMinor: z.number().int().min(0),
  isDemoValue: z.boolean(),
});
export type CommercialSettingsEntity = z.infer<typeof commercialSettingsEntitySchema>;

export const taxProfileEntitySchema = tenantEntityBaseSchema.extend({
  name: z.string().min(2).max(80),
  serviceTypes: z.array(serviceTypeSchema),
  /** Basis points: 1400 = 14%. */
  rateBp: z.number().int().min(0).max(5000),
  inclusive: z.boolean(),
  base: z.enum(['full_price', 'margin']),
  isDemoValue: z.boolean(),
});
export type TaxProfileEntity = z.infer<typeof taxProfileEntitySchema>;

export const feeRuleEntitySchema = tenantEntityBaseSchema.extend({
  name: z.string().min(2).max(80),
  serviceTypes: z.array(serviceTypeSchema),
  channel: z.enum(['b2b', 'b2c', 'all']),
  mode: markupModeSchema,
  value: z.number().min(0),
  per: z.enum(['unit', 'booking']),
  taxable: z.boolean(),
  status: z.enum(['active', 'inactive']),
  isDemoValue: z.boolean(),
});
export type FeeRuleEntity = z.infer<typeof feeRuleEntitySchema>;

export const promoCodeEntitySchema = tenantEntityBaseSchema.extend({
  code: z.string().regex(/^[A-Z0-9-]{3,20}$/),
  mode: markupModeSchema,
  value: z.number().min(0),
  serviceTypes: z.array(serviceTypeSchema),
  validFrom: isoDateSchema,
  validTo: isoDateSchema,
  maxUses: z.number().int().min(1).nullable(),
  uses: z.number().int().min(0),
  status: z.enum(['active', 'inactive']),
  isDemoValue: z.boolean(),
});
export type PromoCodeEntity = z.infer<typeof promoCodeEntitySchema>;

// ---- Pricing request / breakdown (PRICING_ENGINE §2, §8) -------------------------------------------------

export const netLineSchema = z.object({
  key: z.string(),
  label: z.object({ en: z.string(), ar: z.string() }),
  unitType: unitTypeSchema,
  quantity: z.number().int().min(1),
  netUnitMinor: z.number().int().min(0),
  currency: currencySchema,
  taxProfileId: z.string().nullable().optional(),
});
export type NetLine = z.infer<typeof netLineSchema>;

export const fxSnapshotSchema = z.object({ base: currencySchema, quote: currencySchema, rate: z.number().positive(), date: isoDateSchema, bufferPct: z.number() });
export type FxSnapshot = z.infer<typeof fxSnapshotSchema>;

export const breakdownOwnerSchema = z.enum(['supplier', 'platform', 'agency', 'sub_agency', 'tax']);
/** `buy_price` appears only in redacted projections: an agency sees its cost as one figure (TENANCY §4). */
export const breakdownLineKeySchema = z.enum(['net', 'fx_buffer', 'platform_markup', 'agency_markup', 'sub_agency_markup', 'fee', 'discount', 'tax', 'rounding', 'buy_price']);

export const breakdownLineSchema = z.object({
  key: breakdownLineKeySchema,
  owner: breakdownOwnerSchema,
  label: z.string(),
  amountMinor: z.number().int(),
  ruleId: z.string().nullable(),
  ruleVersion: z.number().int().nullable(),
  ruleName: z.string().nullable(),
  /** How the amount was derived, e.g. "8% of 1,000.00" or "20.00 per booking". */
  basis: z.string(),
  clamped: z.boolean(),
  override: z.object({ by: z.string(), reason: z.string(), originalMinor: z.number().int() }).nullable(),
});
export type BreakdownLine = z.infer<typeof breakdownLineSchema>;

export const priceBreakdownSchema = z.object({
  engineVersion: z.string(),
  computedAt: isoDateTimeSchema,
  currency: currencySchema,
  fx: z.array(fxSnapshotSchema),
  lines: z.array(breakdownLineSchema),
  units: z.array(z.object({ key: z.string(), label: z.object({ en: z.string(), ar: z.string() }), unitType: unitTypeSchema, quantity: z.number().int(), netMinor: z.number().int(), sellMinor: z.number().int(), taxMinor: z.number().int() })),
  totals: z.object({ netMinor: z.number().int(), preTaxMinor: z.number().int(), taxMinor: z.number().int(), customerTotalMinor: z.number().int() }),
  settlement: z.object({
    supplierPayoutMinor: z.number().int(),
    commissionMinor: z.number().int(),
    commissionBeneficiary: z.enum(['platform', 'agency', 'none']),
    platformRevenueMinor: z.number().int(),
    agencyRevenueMinor: z.number().int(),
    subAgencyRevenueMinor: z.number().int(),
    taxPayableMinor: z.number().int(),
  }),
  /** What each tier pays the tier above (buy prices), pre-tax. */
  buyPrices: z.object({ agencyBuyMinor: z.number().int(), subAgencyBuyMinor: z.number().int().nullable() }),
  margins: z.object({ platformPct: z.number(), agencyPct: z.number(), subAgencyPct: z.number().nullable(), grossProfitMinor: z.number().int() }),
  context: z.object({
    serviceType: serviceTypeSchema, source: inventorySourceSchema, ownership: supplierOwnershipSchema, channel: z.enum(['b2b', 'b2c']),
    customerType: customerTypeSchema, finalSeller: z.enum(['platform', 'agency', 'sub_agency']),
  }),
  warnings: z.array(z.string()),
});
export type PriceBreakdown = z.infer<typeof priceBreakdownSchema>;
