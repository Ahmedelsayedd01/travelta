import { z } from 'zod';
import { isoDateTimeSchema } from '../primitives';

/** Fields every stored entity carries (DATABASE_DESIGN conventions). */
export const entityBaseSchema = z.object({
  id: z.string().min(3),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Optimistic-concurrency version; incremented on every update (DATA_CONTRACTS §7). */
  version: z.number().int().min(1),
});
export type EntityBase = z.infer<typeof entityBaseSchema>;

/** Tenant-owned rows carry the owning organization id; repositories scope on it automatically. */
export const tenantEntityBaseSchema = entityBaseSchema.extend({ tenantId: z.string().min(3) });
export type TenantEntityBase = z.infer<typeof tenantEntityBaseSchema>;
