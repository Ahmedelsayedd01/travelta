import { z } from 'zod';
import { currencySchema, emailSchema, listQuerySchema, localizedTextSchema, requiredText } from '../primitives';
import { orgStatusSchema, orgTypeSchema, kycCaseStatusSchema, serviceTypeSchema } from '../enums';
import { agencySupplierEntitySchema, supplierContractEntitySchema } from '../entities/suppliers';
import { permissionSchema } from '../entities/identity';
import { pageOf } from './reference';
import { op } from './define';

export const organizationDtoSchema = z.object({
  id: z.string(),
  type: orgTypeSchema,
  parentId: z.string().nullable(),
  parentName: localizedTextSchema.nullable(),
  name: localizedTextSchema,
  legalName: z.string(),
  slug: z.string(),
  countryIso2: z.string(),
  city: z.string(),
  baseCurrency: currencySchema,
  status: orgStatusSchema,
  kycStatus: kycCaseStatusSchema,
  serviceTypes: z.array(serviceTypeSchema),
  isPlatformRetail: z.boolean(),
  contactEmail: z.string(),
  contactPhone: z.string(),
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type OrganizationDto = z.infer<typeof organizationDtoSchema>;

/** Profile fields an organization may edit about itself (settings.manage). */
export const organizationProfileInputSchema = z.object({
  name: localizedTextSchema,
  legalName: requiredText(160),
  city: requiredText(80),
  contactEmail: emailSchema,
  contactPhone: requiredText(30),
  baseCurrency: currencySchema,
});
export type OrganizationProfileInput = z.input<typeof organizationProfileInputSchema>;

export const subAgencyInputSchema = z.object({
  name: localizedTextSchema,
  legalName: requiredText(160),
  city: requiredText(80),
  contactEmail: emailSchema,
  contactPhone: requiredText(30),
  owner: z.object({ name: requiredText(120), email: emailSchema }),
});
export type SubAgencyInput = z.input<typeof subAgencyInputSchema>;

export const roleDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: localizedTextSchema,
  isSystem: z.boolean(),
  permissions: z.array(permissionSchema),
  memberCount: z.number().int(),
});
export type RoleDto = z.infer<typeof roleDtoSchema>;

export const roleInputSchema = z.object({
  name: localizedTextSchema,
  permissions: z.array(permissionSchema).min(1, { error: 'validation.required' }),
});
export type RoleInput = z.input<typeof roleInputSchema>;

export const inviteMemberInputSchema = z.object({
  name: requiredText(120),
  email: emailSchema,
  roleId: z.string().min(1, { error: 'validation.required' }),
});
export type InviteMemberInput = z.input<typeof inviteMemberInputSchema>;

export const agencySupplierInputSchema = agencySupplierEntitySchema.pick({
  name: true, serviceTypes: true, contactName: true, email: true, phone: true, currency: true, notes: true, status: true,
});
export type AgencySupplierInput = z.input<typeof agencySupplierInputSchema>;

export const supplierDtoSchema = z.object({
  kind: z.enum(['network', 'own']),
  id: z.string(),
  name: localizedTextSchema,
  serviceTypes: z.array(serviceTypeSchema),
  city: z.string(),
  currency: currencySchema,
  status: z.string(),
  contact: z.string(),
  activeContract: supplierContractEntitySchema.nullable(),
});
export type SupplierDto = z.infer<typeof supplierDtoSchema>;

export const contractInputSchema = supplierContractEntitySchema
  .pick({ supplier: true, reference: true, validFrom: true, validTo: true, commissionPct: true, commissionByService: true, payoutDays: true, creditTerms: true, status: true })
  .refine((c) => c.validTo >= c.validFrom, { error: 'validation.invalid_date', path: ['validTo'] });
export type ContractInput = z.input<typeof contractInputSchema>;

const idInput = z.object({ id: z.string() });

export const organizationOperations = {
  'orgs.list': op({ input: listQuerySchema, output: pageOf(organizationDtoSchema), http: { method: 'GET', path: '/organizations' }, auth: 'session' }),
  'orgs.get': op({ input: idInput, output: organizationDtoSchema, http: { method: 'GET', path: '/organizations/:id' }, auth: 'session' }),
  'orgs.setStatus': op({
    input: z.object({ id: z.string(), status: z.enum(['active', 'suspended']), reason: requiredText(300) }),
    output: organizationDtoSchema, http: { method: 'POST', path: '/organizations/:id/status' }, auth: 'session',
  }),
  /** Platform admin: edit any agency or supplier profile (same fields the organization edits about itself). */
  'orgs.update': op({ input: organizationProfileInputSchema.extend({ id: z.string() }), output: organizationDtoSchema, http: { method: 'PUT', path: '/organizations/:id' }, auth: 'session' }),
  'orgs.myProfile': op({ input: z.void(), output: organizationDtoSchema, http: { method: 'GET', path: '/organizations/me' }, auth: 'session' }),
  'orgs.updateMyProfile': op({ input: organizationProfileInputSchema, output: organizationDtoSchema, http: { method: 'PUT', path: '/organizations/me' }, auth: 'session' }),
  'subAgencies.list': op({ input: listQuerySchema, output: pageOf(organizationDtoSchema), http: { method: 'GET', path: '/sub-agencies' }, auth: 'session' }),
  'subAgencies.create': op({ input: subAgencyInputSchema, output: organizationDtoSchema, http: { method: 'POST', path: '/sub-agencies' }, auth: 'session' }),

  'roles.list': op({ input: z.void(), output: z.array(roleDtoSchema), http: { method: 'GET', path: '/roles' }, auth: 'session' }),
  'roles.create': op({ input: roleInputSchema, output: roleDtoSchema, http: { method: 'POST', path: '/roles' }, auth: 'session' }),
  'roles.update': op({ input: roleInputSchema.extend({ id: z.string() }), output: roleDtoSchema, http: { method: 'PUT', path: '/roles/:id' }, auth: 'session' }),
  'roles.delete': op({ input: idInput, output: z.object({ ok: z.literal(true) }), http: { method: 'DELETE', path: '/roles/:id' }, auth: 'session' }),
  'team.invite': op({ input: inviteMemberInputSchema, output: z.object({ userId: z.string(), invited: z.boolean() }), http: { method: 'POST', path: '/team/members' }, auth: 'session' }),
  'team.updateMember': op({
    input: z.object({ userId: z.string(), roleId: z.string().optional(), status: z.enum(['active', 'disabled']).optional() }),
    output: z.object({ ok: z.literal(true) }), http: { method: 'PATCH', path: '/team/members/:userId' }, auth: 'session',
  }),

  'suppliers.list': op({ input: listQuerySchema, output: pageOf(supplierDtoSchema), http: { method: 'GET', path: '/suppliers' }, auth: 'session' }),
  'suppliers.getOwn': op({ input: idInput, output: agencySupplierEntitySchema, http: { method: 'GET', path: '/suppliers/:id' }, auth: 'session' }),
  'suppliers.createOwn': op({ input: agencySupplierInputSchema, output: agencySupplierEntitySchema, http: { method: 'POST', path: '/suppliers' }, auth: 'session' }),
  'suppliers.updateOwn': op({ input: agencySupplierInputSchema.extend({ id: z.string() }), output: agencySupplierEntitySchema, http: { method: 'PUT', path: '/suppliers/:id' }, auth: 'session' }),
  'contracts.list': op({ input: z.object({ supplierId: z.string().optional() }), output: z.array(supplierContractEntitySchema), http: { method: 'GET', path: '/supplier-contracts' }, auth: 'session' }),
  'contracts.save': op({ input: contractInputSchema.and(z.object({ id: z.string().optional() })), output: supplierContractEntitySchema, http: { method: 'PUT', path: '/supplier-contracts' }, auth: 'session' }),
} as const;
