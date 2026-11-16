import { brandColorReadable, contrastBetween, subdomainOf } from '@travelta/domain';
import type { OrganizationEntity, PublicStorefront, StorefrontDto, StorefrontEntity, StorefrontInput } from '@travelta/schemas';
import { storefrontInputSchema } from '@travelta/schemas';
import { createId, createRng, hashString } from '@travelta/shared';
import type { RequestContext } from '../context';
import type { Database } from '../db/database';
import { ApiException, forbidden, invalid, notFound } from '../errors';
import type { Principal } from '../security';
import { audit } from './audit';
import { subscriptionFor } from './subscriptions';

/** Storefronts belong to top-level agencies; the add-on (or a plan that includes it) is required to publish (SUB-1). */
export function storefrontEntitled(db: Database, org: OrganizationEntity): boolean {
  const s = subscriptionFor(db, org);
  if (!s) return false;
  const plan = db.get('subscriptionPlans', s.planId);
  return Boolean(plan && (plan.storefrontIncluded || s.storefrontAddon));
}

export function defaultStorefront(org: OrganizationEntity, now: string, id: string): StorefrontEntity {
  return {
    id, createdAt: now, updatedAt: now, version: 1, tenantId: org.id, published: false, displayName: org.name,
    tagline: { en: 'Trips planned by people who know the region', ar: 'رحلات يخططها خبراء المنطقة' }, logo: null,
    primaryColor: '#0F766E', heroColor: '#0F2A3F', subdomain: org.slug.replace(/[^a-z0-9-]/g, '').slice(0, 40), customDomain: null, domainStatus: 'none',
    verificationToken: null, dnsRecordPresent: false, domainCheckedAt: null, supportEmail: org.contactEmail, supportPhone: org.contactPhone, showPoweredBy: true,
  };
}

function own(ctx: RequestContext, p: Principal, manage = false): StorefrontEntity {
  if (p.user.userType !== 'staff' || p.org.type !== 'agency' || p.org.parentId || p.org.isPlatformRetail) throw forbidden('Storefronts belong to top-level agencies');
  if (!p.permissions.has(manage ? 'storefront.manage' : 'storefront.view')) throw forbidden(`Missing permission: storefront.${manage ? 'manage' : 'view'}`);
  const existing = ctx.db.find('storefronts', (s) => s.tenantId === p.org.id);
  if (existing) return existing;
  return ctx.db.insert('storefronts', defaultStorefront(p.org, ctx.clock.nowIso(), createId('sf', ctx.clock.now())));
}

export function storefrontDto(ctx: RequestContext, p: Principal, s: StorefrontEntity): StorefrontDto {
  const org = ctx.db.get('organizations', s.tenantId)!;
  const bookings = ctx.db.filter('bookings', (b) => b.tenantId === s.tenantId && b.channel === 'b2c' && ctx.db.get('customers', b.customerId ?? '')?.userId != null);
  return {
    ...s, slug: org.slug,
    urls: { path: `/s/${org.slug}`, subdomain: `${s.subdomain}.travelta.app`, custom: s.domainStatus === 'verified' ? s.customDomain : null },
    contrast: { primary: contrastBetween(s.primaryColor, '#FFFFFF'), hero: contrastBetween(s.heroColor, '#FFFFFF') },
    canManage: p.permissions.has('storefront.manage'), entitled: storefrontEntitled(ctx.db, org),
    stats: {
      customers: ctx.db.filter('customers', (c) => c.tenantId === s.tenantId && c.userId !== null).length,
      bookings: bookings.length, salesMinor: bookings.filter((b) => b.status !== 'cancelled').reduce((sum, b) => sum + b.totals.sellMinor, 0),
    },
  };
}

export const getStorefront = (ctx: RequestContext, p: Principal) => storefrontDto(ctx, p, own(ctx, p));

export function saveStorefront(ctx: RequestContext, p: Principal, raw: StorefrontInput): StorefrontDto {
  const s = own(ctx, p, true);
  const input = storefrontInputSchema.parse(raw);
  const issues = [
    !brandColorReadable(input.primaryColor) ? { field: 'primaryColor', issue: 'validation.contrast', params: { ratio: contrastBetween(input.primaryColor, '#FFFFFF') } } : null,
    !brandColorReadable(input.heroColor) ? { field: 'heroColor', issue: 'validation.contrast', params: { ratio: contrastBetween(input.heroColor, '#FFFFFF') } } : null,
    ctx.db.find('storefronts', (x) => x.subdomain === input.subdomain && x.id !== s.id) || ['www', 'app', 'api', 'admin'].includes(input.subdomain) ? { field: 'subdomain', issue: 'validation.subdomain_taken' } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  if (issues.length) throw invalid(issues, 'Fix the highlighted settings');
  const next: StorefrontEntity = { ...s, ...input, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
  ctx.db.replace('storefronts', next);
  audit(ctx, { tenantId: s.tenantId, action: 'storefront.updated', entity: 'storefront', entityId: s.id, after: { subdomain: next.subdomain, primary: next.primaryColor } });
  return storefrontDto(ctx, p, next);
}

export function setPublished(ctx: RequestContext, p: Principal, published: boolean): StorefrontDto {
  const s = own(ctx, p, true);
  if (published && !storefrontEntitled(ctx.db, p.org)) throw new ApiException('PLAN_LIMIT_REACHED', 'Add the storefront to your plan to publish', [{ issue: 'errors.STOREFRONT_ADDON' }]);
  if (published && p.org.status !== 'active') throw new ApiException('ORG_NOT_ELIGIBLE', 'Only verified, active agencies can sell online');
  const next = { ...s, published, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
  ctx.db.replace('storefronts', next);
  audit(ctx, { tenantId: s.tenantId, action: published ? 'storefront.published' : 'storefront.unpublished', entity: 'storefront', entityId: s.id });
  return storefrontDto(ctx, p, next);
}

/** Custom domain (simulated DNS): request → publish the TXT token → verify. Removing the domain clears it. */
export function requestDomain(ctx: RequestContext, p: Principal, domain: string | null): StorefrontDto {
  const s = own(ctx, p, true);
  if (domain && (domain.endsWith('.travelta.app') || ctx.db.find('storefronts', (x) => x.customDomain === domain && x.id !== s.id))) throw invalid([{ field: 'domain', issue: 'validation.domain_taken' }]);
  const token = domain ? `travelta-verify=${(createRng(hashString(`${s.id}:${domain}`)).next() * 1e16).toString(36).slice(0, 12)}` : null;
  const next: StorefrontEntity = { ...s, customDomain: domain, domainStatus: domain ? 'pending' : 'none', verificationToken: token, dnsRecordPresent: false, domainCheckedAt: null, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
  ctx.db.replace('storefronts', next);
  audit(ctx, { tenantId: s.tenantId, action: 'storefront.domain_requested', entity: 'storefront', entityId: s.id, after: { domain } });
  return storefrontDto(ctx, p, next);
}

export function simulateDns(ctx: RequestContext, p: Principal): StorefrontDto {
  const s = own(ctx, p, true);
  if (!s.customDomain) throw invalid([{ field: 'domain', issue: 'validation.required' }]);
  const next = { ...s, dnsRecordPresent: true, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
  ctx.db.replace('storefronts', next);
  return storefrontDto(ctx, p, next);
}

export function verifyDomain(ctx: RequestContext, p: Principal): StorefrontDto {
  const s = own(ctx, p, true);
  if (!s.customDomain) throw invalid([{ field: 'domain', issue: 'validation.required' }]);
  const next: StorefrontEntity = { ...s, domainStatus: s.dnsRecordPresent ? 'verified' : 'failed', domainCheckedAt: ctx.clock.nowIso(), updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
  ctx.db.replace('storefronts', next);
  audit(ctx, { tenantId: s.tenantId, action: `storefront.domain_${next.domainStatus}`, entity: 'storefront', entityId: s.id, after: { domain: s.customDomain } });
  return storefrontDto(ctx, p, next);
}

/** The storefront a visitor reaches by slug, `<sub>.travelta.app`/`<sub>.localhost`, or a verified custom domain. */
export function resolveStorefront(db: Database, q: { slug?: string; host?: string }): { org: OrganizationEntity; store: StorefrontEntity } {
  let store: StorefrontEntity | undefined;
  if (q.slug) {
    const org = db.find('organizations', (o) => o.slug === q.slug && o.type === 'agency');
    store = org ? db.find('storefronts', (s) => s.tenantId === org.id) : undefined;
  } else if (q.host) {
    const sub = subdomainOf(q.host);
    const host = q.host.toLowerCase().split(':')[0];
    store = sub ? db.find('storefronts', (s) => s.subdomain === sub) : db.find('storefronts', (s) => s.customDomain === host && s.domainStatus === 'verified');
  }
  const org = store ? db.get('organizations', store.tenantId) : undefined;
  if (!store || !org || !store.published || org.status !== 'active' || !storefrontEntitled(db, org)) throw notFound('Storefront');
  return { org, store };
}

export function publicStorefront(db: Database, q: { slug?: string; host?: string }): PublicStorefront {
  const { org, store } = resolveStorefront(db, q);
  return {
    slug: org.slug, orgId: org.id, orgName: org.name, displayName: store.displayName, tagline: store.tagline, logoUrl: store.logo?.dataUrl ?? null,
    primaryColor: store.primaryColor, heroColor: store.heroColor, supportEmail: store.supportEmail, supportPhone: store.supportPhone, showPoweredBy: store.showPoweredBy, currency: org.baseCurrency,
  };
}
