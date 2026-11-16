import { portalForOrgType } from '@travelta/contracts';
import type { DemoAccount, OrganizationEntity, UserEntity } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../context';
import { ApiException, forbidden, invalid } from '../errors';
import { requirePrincipal } from '../security';
import { audit } from '../services/audit';
import { activeMemberships, issueSession, toSessionDto } from '../services/auth';
import { simHash, verifyPassword } from '../services/passwords';
import { DEMO_ACCOUNTS } from '../seed/identity';
import { resolveStorefront } from '../services/storefront';
import { message, platformOrgId } from '../services/notifications';
import type { HandlerMap } from './types';

const BAD_CREDENTIALS = () => new ApiException('UNAUTHENTICATED', 'Email or password is incorrect');

/** Storefront slug → selling organization (Travelta Direct when omitted). */
function sellerFor(ctx: RequestContext, storefront?: string): OrganizationEntity {
  // A branded storefront must be published (M22); omitted = Travelta Direct.
  if (storefront) return resolveStorefront(ctx.db, { slug: storefront }).org;
  const org = ctx.db.find('organizations', (o) => o.isPlatformRetail);
  if (!org) throw new ApiException('NOT_FOUND', 'Storefront not found');
  return org;
}

function startSession(ctx: RequestContext, user: UserEntity, audience: 'staff' | 'customer', storefront?: string) {
  if (user.status === 'disabled') throw forbidden('Account disabled');
  if (audience === 'customer') {
    if (user.userType !== 'customer') throw forbidden('Staff accounts sign in to the web portal');
    const session = issueSession(ctx.db, ctx.clock, user, user.sellerTenantId ?? sellerFor(ctx, storefront).id, 'customer');
    ctx.db.replace('users', { ...user, lastLoginAt: ctx.clock.nowIso(), version: user.version + 1, updatedAt: ctx.clock.nowIso() });
    return toSessionDto(ctx.db, ctx.clock, session);
  }
  if (user.userType !== 'staff') throw forbidden('Customer accounts sign in to the storefront');
  const membership = activeMemberships(ctx.db, user.id)[0];
  if (!membership) throw forbidden('No active organization membership');
  const session = issueSession(ctx.db, ctx.clock, user, membership.tenantId, 'staff');
  ctx.db.replace('users', { ...user, lastLoginAt: ctx.clock.nowIso(), version: user.version + 1, updatedAt: ctx.clock.nowIso() });
  audit(ctx, { tenantId: membership.tenantId, action: 'auth.login', entity: 'user', entityId: user.id, actorUserId: user.id });
  return toSessionDto(ctx.db, ctx.clock, session);
}

const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;

/** Issue a fresh 6-digit code (older unused codes of the same purpose stop working) and "email" it via the outbox. */
function issueCode(ctx: RequestContext, user: UserEntity, purpose: 'password_reset' | 'email_verify'): string {
  const now = ctx.clock.nowIso();
  for (const old of ctx.db.filter('authCodes', (c) => c.userId === user.id && c.purpose === purpose && c.usedAt === null)) {
    ctx.db.replace('authCodes', { ...old, usedAt: now, version: old.version + 1, updatedAt: now });
  }
  const code = String(Math.floor(100_000 + Math.random() * 900_000));
  const salt = createId('slt', ctx.clock.now()).slice(4, 14);
  ctx.db.insert('authCodes', {
    id: createId('otp', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, userId: user.id, purpose,
    codeHash: simHash(code, salt), expiresAt: new Date(ctx.clock.now() + CODE_MINUTES * 60_000).toISOString(), attempts: 0, usedAt: null,
  });
  message(ctx, {
    tenantId: user.sellerTenantId ?? activeMemberships(ctx.db, user.id)[0]?.tenantId ?? platformOrgId(ctx.db), topic: purpose === 'password_reset' ? 'auth.password_reset' : 'auth.email_verify',
    to: { name: user.name, email: user.email }, locale: user.locale, vars: { code, minutes: CODE_MINUTES }, related: { kind: 'user', id: user.id },
  });
  return code;
}

/** Check a code: expired, used and over-attempted codes fail the same way; each wrong guess counts. */
function consumeCode(ctx: RequestContext, user: UserEntity, purpose: 'password_reset' | 'email_verify', code: string): void {
  const now = ctx.clock.nowIso();
  const active = ctx.db.filter('authCodes', (c) => c.userId === user.id && c.purpose === purpose && c.usedAt === null && c.expiresAt > now && c.attempts < MAX_ATTEMPTS)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const invalidCode = () => new ApiException('VALIDATION_ERROR', 'The code is invalid or has expired', [{ field: 'code', issue: 'validation.otp_invalid' }]);
  if (!active) throw invalidCode();
  if (!verifyPassword(code, active.codeHash)) {
    // The failed request rolls back; the wrong guess must still count towards MAX_ATTEMPTS.
    ctx.onRollback?.(() => {
      const cur = ctx.db.get('authCodes', active.id);
      if (cur) ctx.db.replace('authCodes', { ...cur, attempts: cur.attempts + 1, version: cur.version + 1, updatedAt: now });
    });
    throw invalidCode();
  }
  ctx.db.replace('authCodes', { ...active, usedAt: now, version: active.version + 1, updatedAt: now });
}

function userFor(ctx: RequestContext, email: string, audience: 'staff' | 'customer', storefront?: string): UserEntity | undefined {
  if (audience === 'staff') return ctx.db.find('users', (u) => u.email === email && u.userType === 'staff');
  const seller = sellerFor(ctx, storefront);
  return ctx.db.find('users', (u) => u.email === email && u.userType === 'customer' && u.sellerTenantId === seller.id);
}

export const authHandlers: HandlerMap<'auth.login' | 'auth.registerCustomer' | 'auth.me' | 'auth.logout' | 'auth.switchOrg' | 'demo.accounts' | 'demo.loginAs'
  | 'auth.requestPasswordReset' | 'auth.resetPassword' | 'auth.requestEmailVerification' | 'auth.verifyEmail'> = {
  'auth.requestPasswordReset': (ctx, { email, audience, storefront }) => {
    const user = userFor(ctx, email, audience, storefront);
    const code = user && user.status !== 'disabled' ? issueCode(ctx, user, 'password_reset') : null;
    if (user) audit(ctx, { tenantId: user.sellerTenantId ?? activeMemberships(ctx.db, user.id)[0]?.tenantId ?? platformOrgId(ctx.db), action: 'auth.password_reset_requested', entity: 'user', entityId: user.id, actorUserId: user.id });
    return { sent: true as const, expiresInMinutes: CODE_MINUTES, demoCode: code };
  },

  'auth.resetPassword': (ctx, { email, audience, storefront, code, password }) => {
    const user = userFor(ctx, email, audience, storefront);
    if (!user) throw new ApiException('VALIDATION_ERROR', 'The code is invalid or has expired', [{ field: 'code', issue: 'validation.otp_invalid' }]);
    consumeCode(ctx, user, 'password_reset', code);
    const now = ctx.clock.nowIso();
    const salt = createId('slt', ctx.clock.now()).slice(4, 14);
    // A reset proves control of the mailbox, so it also verifies the email.
    ctx.db.replace('users', { ...user, passwordHash: simHash(password, salt), emailVerifiedAt: user.emailVerifiedAt ?? now, version: user.version + 1, updatedAt: now });
    for (const s of ctx.db.filter('sessions', (x) => x.userId === user.id && x.revokedAt === null)) {
      ctx.db.replace('sessions', { ...s, revokedAt: now, version: s.version + 1, updatedAt: now });
    }
    audit(ctx, { tenantId: user.sellerTenantId ?? activeMemberships(ctx.db, user.id)[0]?.tenantId ?? platformOrgId(ctx.db), action: 'auth.password_reset', entity: 'user', entityId: user.id, actorUserId: user.id });
    return { ok: true as const };
  },

  'auth.requestEmailVerification': (ctx) => {
    const { user } = requirePrincipal(ctx);
    if (user.emailVerifiedAt) return { sent: true as const, expiresInMinutes: CODE_MINUTES, demoCode: null };
    return { sent: true as const, expiresInMinutes: CODE_MINUTES, demoCode: issueCode(ctx, user, 'email_verify') };
  },

  'auth.verifyEmail': (ctx, { code }) => {
    const { user, session } = requirePrincipal(ctx);
    if (!user.emailVerifiedAt) {
      consumeCode(ctx, user, 'email_verify', code);
      ctx.db.replace('users', { ...user, emailVerifiedAt: ctx.clock.nowIso(), version: user.version + 1, updatedAt: ctx.clock.nowIso() });
      audit(ctx, { tenantId: session.tenantId, action: 'auth.email_verified', entity: 'user', entityId: user.id });
    }
    return toSessionDto(ctx.db, ctx.clock, session);
  },

  'auth.login': (ctx, { email, password, audience, storefront }) => {
    const seller = audience === 'customer' ? sellerFor(ctx, storefront) : null;
    const user = ctx.db.find('users', (u) =>
      u.email === email && (audience === 'customer' ? u.userType === 'customer' && u.sellerTenantId === seller!.id : u.userType === 'staff'),
    ) ?? ctx.db.find('users', (u) => u.email === email); // wrong audience → precise FORBIDDEN below instead of a vague error
    if (!user || !verifyPassword(password, user.passwordHash)) throw BAD_CREDENTIALS();
    return startSession(ctx, user, audience, storefront);
  },

  'auth.registerCustomer': (ctx, input) => {
    const seller = sellerFor(ctx, input.storefront);
    if (seller.status !== 'active') throw new ApiException('ORG_NOT_ELIGIBLE', 'This storefront is not accepting registrations');
    if (ctx.db.find('users', (u) => u.email === input.email && u.userType === 'customer' && u.sellerTenantId === seller.id)) {
      throw new ApiException('CONFLICT', 'An account with this email already exists', [{ field: 'email', issue: 'validation.email_taken' }]);
    }
    const now = ctx.clock.nowIso();
    const salt = createId('slt', ctx.clock.now()).slice(4, 14);
    const user = ctx.db.insert('users', {
      id: createId('usr', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1,
      email: input.email, name: input.name, phone: input.phone ?? null, locale: input.locale, userType: 'customer', status: 'active',
      passwordHash: simHash(input.password, salt), sellerTenantId: seller.id, lastLoginAt: null, emailVerifiedAt: null,
    });
    audit(ctx, { tenantId: seller.id, action: 'customer.registered', entity: 'user', entityId: user.id, actorUserId: user.id });
    issueCode(ctx, user, 'email_verify');
    return startSession(ctx, user, 'customer', input.storefront);
  },

  'auth.me': (ctx) => toSessionDto(ctx.db, ctx.clock, requirePrincipal(ctx).session),

  'auth.logout': (ctx) => {
    const { session } = requirePrincipal(ctx);
    ctx.db.replace('sessions', { ...session, revokedAt: ctx.clock.nowIso(), version: session.version + 1, updatedAt: ctx.clock.nowIso() });
    return { ok: true as const };
  },

  'auth.switchOrg': (ctx, { tenantId }) => {
    const { user, session } = requirePrincipal(ctx);
    if (user.userType !== 'staff') throw forbidden('Customers cannot switch organizations');
    // Only organizations the user actually belongs to — never a client-chosen tenant (TENANCY §2).
    if (!activeMemberships(ctx.db, user.id).some((m) => m.tenantId === tenantId)) throw forbidden('Not a member of that organization');
    ctx.db.replace('sessions', { ...session, revokedAt: ctx.clock.nowIso(), version: session.version + 1, updatedAt: ctx.clock.nowIso() });
    const next = issueSession(ctx.db, ctx.clock, user, tenantId, 'staff');
    audit(ctx, { tenantId, action: 'auth.switch_org', entity: 'user', entityId: user.id });
    return toSessionDto(ctx.db, ctx.clock, next);
  },

  'demo.accounts': (ctx) =>
    DEMO_ACCOUNTS.flatMap((a): DemoAccount[] => {
      const user = ctx.db.find('users', (u) => u.email === a.email);
      if (!user) return [];
      const orgId = user.userType === 'customer' ? user.sellerTenantId : activeMemberships(ctx.db, user.id)[0]?.tenantId;
      const org = orgId ? ctx.db.get('organizations', orgId) : undefined;
      if (!org) return [];
      return [{
        email: a.email, name: user.name, roleKey: a.role, orgName: org.name, orgType: org.type, orgStatus: org.status,
        audience: user.userType, portal: user.userType === 'customer' ? 'account' : portalForOrgType[org.type],
      }];
    }),

  'demo.loginAs': (ctx, { email, audience }) => {
    if (!DEMO_ACCOUNTS.some((a) => a.email === email)) throw invalid([{ field: 'email', issue: 'validation.invalid_value' }], 'Not a demo account');
    const user = ctx.db.find('users', (u) => u.email === email);
    if (!user) throw new ApiException('NOT_FOUND', 'Demo account not found (was the data imported from another version?)');
    return startSession(ctx, user, audience);
  },
};
