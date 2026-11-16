import { z } from 'zod';
import { isoDateTimeSchema, listQuerySchema } from '../primitives';
import { orgTypeSchema } from '../enums';
import { pageOf } from './reference';
import { op } from './define';

/** A member of the caller's active organization (TENANCY §2: always scoped to the session's tenant). */
export const teamMemberDtoSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  status: z.enum(['active', 'invited', 'disabled']),
  role: z.object({ id: z.string(), key: z.string(), name: z.object({ en: z.string(), ar: z.string() }), isSystem: z.boolean() }),
  lastLoginAt: isoDateTimeSchema.nullable(),
});
export type TeamMemberDto = z.infer<typeof teamMemberDtoSchema>;

export const auditEntryDtoSchema = z.object({
  id: z.string(),
  at: isoDateTimeSchema,
  tenantId: z.string(),
  tenantName: z.object({ en: z.string(), ar: z.string() }),
  tenantType: orgTypeSchema,
  actorName: z.string().nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
});
export type AuditEntryDto = z.infer<typeof auditEntryDtoSchema>;

export const teamOperations = {
  'team.members': op({ input: listQuerySchema, output: pageOf(teamMemberDtoSchema), http: { method: 'GET', path: '/team/members' }, auth: 'session' }),
  'audit.list': op({ input: listQuerySchema, output: pageOf(auditEntryDtoSchema), http: { method: 'GET', path: '/audit-log' }, auth: 'session' }),
} as const;
