import { portalForOrgType, type Permission } from '@travelta/contracts';
import type { SessionDto, SessionEntity, UserEntity } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { DemoClock } from '../clock';
import type { Database } from '../db/database';
import { ApiException } from '../errors';
import type { Principal } from '../security';

export const SESSION_TTL_MS = 7 * 86_400_000;

function randomToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  const bytes = new Uint8Array(40);
  if (g.crypto?.getRandomValues) g.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `tvl_${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

/** Resolve the caller for a token, or null if absent. Invalid/expired/revoked tokens are UNAUTHENTICATED. */
export function resolvePrincipal(db: Database, clock: DemoClock, token: string | null | undefined): Principal | null {
  if (!token) return null;
  const session = db.find('sessions', (s) => s.token === token);
  if (!session || session.revokedAt || session.expiresAt <= clock.nowIso()) {
    throw new ApiException('UNAUTHENTICATED', 'Session expired or invalid');
  }
  const user = db.get('users', session.userId);
  const org = db.get('organizations', session.tenantId);
  if (!user || !org || user.status === 'disabled') throw new ApiException('UNAUTHENTICATED', 'Session expired or invalid');

  if (user.userType === 'customer') return { session, user, org, role: null, permissions: new Set() };

  const membership = db.find('memberships', (m) => m.userId === user.id && m.tenantId === org.id && m.status === 'active');
  const role = membership ? db.get('roles', membership.roleId) : undefined;
  if (!membership || !role) throw new ApiException('UNAUTHENTICATED', 'Membership no longer active');
  return { session, user, org, role, permissions: new Set<Permission>(role.permissions) };
}

export function activeMemberships(db: Database, userId: string) {
  return db.filter('memberships', (m) => m.userId === userId && m.status === 'active');
}

export function issueSession(db: Database, clock: DemoClock, user: UserEntity, tenantId: string, audience: SessionEntity['audience']): SessionEntity {
  const now = clock.nowIso();
  return db.insert('sessions', {
    id: createId('ses', clock.now()),
    createdAt: now,
    updatedAt: now,
    version: 1,
    token: randomToken(),
    userId: user.id,
    tenantId,
    audience,
    expiresAt: new Date(clock.now() + SESSION_TTL_MS).toISOString(),
    revokedAt: null,
  });
}

export function toSessionDto(db: Database, clock: DemoClock, session: SessionEntity): SessionDto {
  const principal = resolvePrincipal(db, clock, session.token)!;
  const { user, org, role } = principal;
  const memberships = user.userType === 'staff'
    ? activeMemberships(db, user.id).flatMap((m) => {
        const o = db.get('organizations', m.tenantId);
        const r = db.get('roles', m.roleId);
        return o && r ? [{ tenantId: o.id, orgName: o.name, orgType: o.type, roleName: r.name }] : [];
      })
    : [];
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    portal: user.userType === 'customer' ? 'account' : portalForOrgType[org.type],
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, locale: user.locale, userType: user.userType, emailVerified: user.emailVerifiedAt !== null },
    organization: { id: org.id, type: org.type, name: org.name, status: org.status, parentId: org.parentId, isPlatformRetail: org.isPlatformRetail },
    role: role ? { id: role.id, key: role.key, name: role.name } : null,
    permissions: [...principal.permissions].sort(),
    memberships,
  };
}
