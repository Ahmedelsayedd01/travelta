import { z } from 'zod';
import { currencySchema, emailSchema, isoDateSchema } from '../primitives';
import { serviceTypeSchema } from '../enums';
import { tenantEntityBaseSchema } from './base';

/**
 * An agency's own (off-platform) supplier — manual confirmation by phone/email (DATABASE_DESIGN §4).
 * Network suppliers are organizations of type `supplier`; these are not.
 */
export const agencySupplierEntitySchema = tenantEntityBaseSchema.extend({
  name: z.string().min(2).max(120),
  serviceTypes: z.array(serviceTypeSchema).min(1),
  contactName: z.string().max(120),
  email: emailSchema.or(z.literal('')),
  phone: z.string().max(30),
  currency: currencySchema,
  notes: z.string().max(1000),
  status: z.enum(['active', 'inactive']),
});
export type AgencySupplierEntity = z.infer<typeof agencySupplierEntitySchema>;

/**
 * Supplier contract (PRICING_ENGINE §5): commission is a settlement component credited to the contract owner
 * (platform for network suppliers, the agency for its own suppliers). Values are DEMO until agreed commercially.
 */
export const supplierContractEntitySchema = tenantEntityBaseSchema.extend({
  supplier: z.object({ kind: z.enum(['network', 'own']), id: z.string() }),
  reference: z.string().min(2).max(40),
  validFrom: isoDateSchema,
  validTo: isoDateSchema,
  /** Default commission % on the supplier's net. */
  commissionPct: z.number().min(0).max(50),
  /** Optional per-service override. */
  commissionByService: z.partialRecord(serviceTypeSchema, z.number().min(0).max(50)),
  /** Days after service end the supplier is paid (SUP-3). */
  payoutDays: z.number().int().min(0).max(120),
  creditTerms: z.string().max(500),
  status: z.enum(['draft', 'active', 'expired']),
  isDemoValue: z.boolean(),
});
export type SupplierContractEntity = z.infer<typeof supplierContractEntitySchema>;
