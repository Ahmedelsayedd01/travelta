import type { Permission } from '@travelta/contracts';
import type { OrganizationEntity, RoleEntity, SessionEntity, UserEntity } from '@travelta/schemas';
import type { RequestContext } from './context';
import { ApiException, forbidden } from './errors';

/** The caller, resolved from the session token on every request (TENANCY §2). */
export interface Principal {
  session: SessionEntity;
  user: UserEntity;
  /** Active organization (staff) or the seller organization (customers). */
  org: OrganizationEntity;
  role: RoleEntity | null;
  permissions: ReadonlySet<Permission>;
}

export function requirePrincipal(ctx: RequestContext): Principal {
  if (!ctx.principal) throw new ApiException('UNAUTHENTICATED', 'Sign in required');
  return ctx.principal;
}

export function can(ctx: RequestContext, permission: Permission): boolean {
  return ctx.principal?.permissions.has(permission) ?? false;
}

/** Throws FORBIDDEN unless the caller holds every listed permission. */
export function assertPermission(ctx: RequestContext, ...permissions: Permission[]): Principal {
  const principal = requirePrincipal(ctx);
  const missing = permissions.filter((p) => !principal.permissions.has(p));
  if (missing.length > 0) throw forbidden(`Missing permission: ${missing.join(', ')}`);
  return principal;
}

export function requireStaff(ctx: RequestContext): Principal {
  const principal = requirePrincipal(ctx);
  if (principal.user.userType !== 'staff') throw forbidden('Staff only');
  return principal;
}

export function requireCustomer(ctx: RequestContext): Principal {
  const principal = requirePrincipal(ctx);
  if (principal.user.userType !== 'customer') throw forbidden('Customers only');
  return principal;
}
