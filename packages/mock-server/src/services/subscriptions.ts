import { addDays, createId, diffDays } from '@travelta/shared';
import { dueClockEvent, GRACE_DAYS, periodDays, proration, subscriptionWritable, TRIAL_DAYS, withinLimit, documentNumber } from '@travelta/domain';
import type { OperationName, OrganizationEntity, PlanModule, SubscriptionDto, SubscriptionEntity, SubscriptionInvoiceEntity, SubscriptionPlanEntity } from '@travelta/schemas';
import type { DemoClock } from '../clock';
import type { RequestContext } from '../context';
import type { Database } from '../db/database';
import { ApiException } from '../errors';
import type { Principal } from '../security';
import { defaultFinancialAccount, post } from './finance/ledger';
import { subscriptionChanged } from './notifications/events';

const platformId = (db: Database) => db.find('organizations', (o) => o.type === 'platform')!.id;

/** Sub-agencies run under their parent agency's plan; Travelta Direct (platform retail) has no subscription. */
export function subscriptionOrg(db: Database, org: OrganizationEntity): OrganizationEntity | null {
  if (org.type !== 'agency' || org.isPlatformRetail) return null;
  return org.parentId ? db.get('organizations', org.parentId) ?? null : org;
}
export function subscriptionFor(db: Database, org: OrganizationEntity): SubscriptionEntity | null {
  const owner = subscriptionOrg(db, org);
  return owner ? db.find('subscriptions', (s) => s.tenantId === owner.id) ?? null : null;
}

export function usageOf(db: Database, tenantId: string, today: string) {
  const subs = db.filter('organizations', (o) => o.parentId === tenantId);
  const tenants = new Set([tenantId, ...subs.map((o) => o.id)]);
  return {
    users: db.filter('memberships', (m) => m.tenantId === tenantId && m.status === 'active').length,
    subAgencies: subs.length,
    bookingsThisMonth: db.filter('bookings', (b) => tenants.has(b.tenantId) && b.createdAt.slice(0, 7) === today.slice(0, 7)).length,
  };
}

const priceOf = (plan: SubscriptionPlanEntity, cycle: SubscriptionEntity['cycle']) => (cycle === 'monthly' ? plan.monthlyMinor : plan.yearlyMinor);
const addonPrice = (plan: SubscriptionPlanEntity, s: Pick<SubscriptionEntity, 'storefrontAddon' | 'cycle'>) =>
  s.storefrontAddon && !plan.storefrontIncluded ? (s.cycle === 'monthly' ? plan.storefrontAddonMonthlyMinor : plan.storefrontAddonMonthlyMinor * 10) : 0;

export function subscriptionDto(db: Database, s: SubscriptionEntity, today: string): SubscriptionDto {
  const plan = db.get('subscriptionPlans', s.planId)!;
  const monthly = (s.cycle === 'monthly' ? plan.monthlyMinor : Math.round(plan.yearlyMinor / 12)) + (s.storefrontAddon && !plan.storefrontIncluded ? plan.storefrontAddonMonthlyMinor : 0);
  return {
    ...s, plan, pendingPlan: s.pendingPlanId ? db.get('subscriptionPlans', s.pendingPlanId) ?? null : null, orgName: db.get('organizations', s.tenantId)?.name.en ?? '—',
    usage: usageOf(db, s.tenantId, today), mrrMinor: s.status === 'active' || s.status === 'past_due' ? monthly : 0,
    daysLeftInTrial: s.status === 'trialing' && s.trialEndsAt ? Math.max(0, diffDays(today, s.trialEndsAt)) : null,
    graceEndsAt: s.status === 'past_due' && s.pastDueSince ? addDays(s.pastDueSince, GRACE_DAYS) : null,
    writable: subscriptionWritable(s.status),
  };
}

/** Minimal request context for clock jobs (no caller). */
const jobCtx = (db: Database, clock: DemoClock) => ({ db, clock, principal: null }) as unknown as RequestContext;

/**
 * Simulated card charge for SaaS billing: records the invoice (paid or failed) and, when paid, posts platform revenue
 * (card clearing ← subscription revenue).
 */
function charge(ctx: RequestContext, s: SubscriptionEntity, kind: SubscriptionInvoiceEntity['kind'], lines: SubscriptionInvoiceEntity['lines'], period: { start: string; end: string }): SubscriptionInvoiceEntity {
  const total = Math.max(0, lines.reduce((a, l) => a + l.amountMinor, 0));
  const ok = total === 0 || (s.card !== null && !s.card.failing);
  const now = ctx.clock.nowIso();
  const today = ctx.clock.today();
  const plan = ctx.db.get('subscriptionPlans', s.planId)!;
  const inv = ctx.db.insert('subscriptionInvoices', {
    id: createId('sinv', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: s.tenantId, subscriptionId: s.id,
    number: documentNumber('SUB', today, ctx.db.nextSequence(`subInvoice:${today.slice(0, 4)}`)), kind, lines, totalMinor: total, currency: plan.currency,
    status: ok ? 'paid' : 'failed', periodStart: period.start, periodEnd: period.end, issuedAt: now, cardLast4: s.card?.last4 ?? null,
  });
  if (ok && total > 0) {
    const platform = platformId(ctx.db);
    const org = ctx.db.get('organizations', s.tenantId);
    post(ctx, {
      tenantId: platform, memo: `SaaS ${inv.number} · ${org?.name.en ?? s.tenantId}`, source: 'payment', sourceId: inv.id, currency: plan.currency,
      lines: [
        { accountId: defaultFinancialAccount(ctx, platform, 'card_gateway').ledgerAccountId, debitMinor: total, creditMinor: 0 },
        { key: 'subscription_revenue', debitMinor: 0, creditMinor: total, party: org ? { kind: 'agency', id: org.id, name: org.name.en } : null },
      ],
    });
  }
  return inv;
}

function renew(ctx: RequestContext, s: SubscriptionEntity, reason: 'trial_end' | 'renewal' | 'retry'): SubscriptionEntity {
  const today = ctx.clock.today();
  const planId = reason === 'renewal' && s.pendingPlanId ? s.pendingPlanId : s.planId;
  const plan = ctx.db.get('subscriptionPlans', planId)!;
  const start = reason === 'renewal' ? s.currentPeriodEnd : today;
  const end = addDays(start, periodDays(s.cycle));
  const next = { ...s, planId, pendingPlanId: reason === 'renewal' ? null : s.pendingPlanId };
  const lines = [{ description: `${plan.name.en} — ${s.cycle}`, amountMinor: priceOf(plan, s.cycle) }];
  const addon = addonPrice(plan, next);
  if (addon) lines.push({ description: 'Storefront add-on', amountMinor: addon });
  const inv = charge(ctx, next, reason === 'trial_end' ? 'trial_conversion' : reason === 'retry' ? 'retry' : 'renewal', lines, { start, end });
  const now = ctx.clock.nowIso();
  const out: SubscriptionEntity = inv.status === 'paid'
    ? { ...next, status: 'active', trialEndsAt: reason === 'trial_end' ? s.trialEndsAt : s.trialEndsAt, currentPeriodStart: start, currentPeriodEnd: end, pastDueSince: null, updatedAt: now, version: s.version + 1 }
    : { ...next, status: 'past_due', pastDueSince: s.pastDueSince ?? today, updatedAt: now, version: s.version + 1 };
  ctx.db.replace('subscriptions', out);
  if (out.status === 'past_due') subscriptionChanged(ctx, out);
  return out;
}

/** SUB-2 clock job: trial conversion, renewals (with pending downgrades), grace → suspension, scheduled cancellation. */
export function runSubscriptionJob(db: Database, clock: DemoClock): boolean {
  const ctx = jobCtx(db, clock);
  const today = clock.today();
  let changed = false;
  for (const original of db.all('subscriptions')) {
    let s = original;
    for (let guard = 0; guard < 24; guard++) {
      const ev = dueClockEvent(s, today);
      if (!ev) break;
      changed = true;
      if (ev.kind === 'charge') {
        s = renew(ctx, s, ev.reason);
        if (s.status === 'past_due') continue;
      } else if (ev.kind === 'suspend') {
        s = { ...s, status: 'suspended', updatedAt: clock.nowIso(), version: s.version + 1 };
        db.replace('subscriptions', s);
        subscriptionChanged(ctx, s);
      } else {
        s = { ...s, status: 'cancelled', updatedAt: clock.nowIso(), version: s.version + 1 };
        db.replace('subscriptions', s);
      }
    }
  }
  return changed;
}

// ---- Self-service ------------------------------------------------------------------------------------------------------------
export function requireOwnSubscription(ctx: RequestContext, p: Principal, manage = false): SubscriptionEntity {
  if (p.org.type !== 'agency' || p.org.parentId || p.org.isPlatformRetail) throw new ApiException('FORBIDDEN', 'Subscriptions belong to top-level agencies');
  if (!p.permissions.has(manage ? 'subscriptions.manage' : 'subscriptions.view')) throw new ApiException('FORBIDDEN', `Missing permission: subscriptions.${manage ? 'manage' : 'view'}`);
  const s = subscriptionFor(ctx.db, p.org);
  if (!s) throw new ApiException('NOT_FOUND', 'Subscription not found');
  return s;
}

function assertFits(db: Database, s: SubscriptionEntity, plan: SubscriptionPlanEntity, today: string) {
  const u = usageOf(db, s.tenantId, today);
  const issues = [
    plan.limits.users !== null && u.users > plan.limits.users ? { field: 'planId', issue: 'validation.plan_users', params: { used: u.users, limit: plan.limits.users } } : null,
    plan.limits.subAgencies !== null && u.subAgencies > plan.limits.subAgencies ? { field: 'planId', issue: 'validation.plan_sub_agencies', params: { used: u.subAgencies, limit: plan.limits.subAgencies } } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  if (issues.length) throw new ApiException('PLAN_LIMIT_REACHED', 'Current usage exceeds the target plan', issues);
}

/** SUB-4: upgrades take effect now with proration; downgrades are scheduled for the period end. */
export function changePlan(ctx: RequestContext, s: SubscriptionEntity, planId: string, cycle = s.cycle) {
  const today = ctx.clock.today();
  const current = ctx.db.get('subscriptionPlans', s.planId)!;
  const target = ctx.db.get('subscriptionPlans', planId);
  if (!target || !target.active) throw new ApiException('VALIDATION_ERROR', 'Unknown plan', [{ field: 'planId', issue: 'validation.invalid_value' }]);
  if (target.id === s.planId && cycle === s.cycle) {
    if (s.pendingPlanId) ctx.db.replace('subscriptions', { ...s, pendingPlanId: null, updatedAt: ctx.clock.nowIso(), version: s.version + 1 });
    return { s: ctx.db.get('subscriptions', s.id)!, effective: 'now' as const, charged: 0 };
  }
  assertFits(ctx.db, s, target, today);
  const upgrade = priceOf(target, cycle) / periodDays(cycle) >= priceOf(current, s.cycle) / periodDays(s.cycle);
  if (s.status === 'trialing') {
    const next = { ...s, planId: target.id, cycle, pendingPlanId: null, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
    ctx.db.replace('subscriptions', next);
    return { s: next, effective: 'now' as const, charged: 0 };
  }
  if (!upgrade) {
    const next = { ...s, pendingPlanId: target.id, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
    ctx.db.replace('subscriptions', next);
    return { s: next, effective: 'period_end' as const, charged: 0 };
  }
  const p = proration(priceOf(current, s.cycle), priceOf(target, s.cycle), s.currentPeriodStart, s.currentPeriodEnd, today);
  const inv = charge(ctx, s, 'upgrade', [
    { description: `${target.name.en} — ${p.remainingDays}/${p.totalDays} days`, amountMinor: p.chargeMinor },
    { description: `Unused ${current.name.en} credit`, amountMinor: -p.creditMinor },
  ], { start: today, end: s.currentPeriodEnd });
  if (inv.status === 'failed') throw new ApiException('PAYMENT_DECLINED', 'The card on file was declined', [{ field: 'card', issue: 'validation.card_declined' }]);
  const next = { ...s, planId: target.id, pendingPlanId: null, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
  ctx.db.replace('subscriptions', next);
  return { s: next, effective: 'now' as const, charged: inv.totalMinor };
}

export function setStorefrontAddon(ctx: RequestContext, s: SubscriptionEntity, on: boolean) {
  const plan = ctx.db.get('subscriptionPlans', s.planId)!;
  if (plan.storefrontIncluded || on === s.storefrontAddon) return { s, charged: 0 };
  let charged = 0;
  if (on && s.status === 'active') {
    const p = proration(0, s.cycle === 'monthly' ? plan.storefrontAddonMonthlyMinor : plan.storefrontAddonMonthlyMinor * 10, s.currentPeriodStart, s.currentPeriodEnd, ctx.clock.today());
    const inv = charge(ctx, s, 'addon', [{ description: `Storefront add-on — ${p.remainingDays}/${p.totalDays} days`, amountMinor: p.chargeMinor }], { start: ctx.clock.today(), end: s.currentPeriodEnd });
    if (inv.status === 'failed') throw new ApiException('PAYMENT_DECLINED', 'The card on file was declined', [{ field: 'card', issue: 'validation.card_declined' }]);
    charged = inv.totalMinor;
  }
  const next = { ...s, storefrontAddon: on, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
  ctx.db.replace('subscriptions', next);
  return { s: next, charged };
}

export function payNow(ctx: RequestContext, s: SubscriptionEntity): SubscriptionEntity {
  if (s.status !== 'past_due' && s.status !== 'suspended') throw new ApiException('INVALID_TRANSITION', 'Nothing is due');
  const out = renew(ctx, s, 'retry');
  if (out.status !== 'active') throw new ApiException('PAYMENT_DECLINED', 'The card on file was declined', [{ field: 'card', issue: 'validation.card_declined' }]);
  return out;
}

export function newTrial(ctx: RequestContext, tenantId: string): SubscriptionEntity {
  const today = ctx.clock.today();
  const plan = ctx.db.filter('subscriptionPlans', (p) => p.active).sort((a, b) => a.sort - b.sort)[1] ?? ctx.db.all('subscriptionPlans')[0]!;
  const now = ctx.clock.nowIso();
  return ctx.db.insert('subscriptions', {
    id: createId('sub', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId, planId: plan.id, cycle: 'monthly', status: 'trialing',
    trialEndsAt: addDays(today, TRIAL_DAYS), currentPeriodStart: today, currentPeriodEnd: addDays(today, TRIAL_DAYS), pastDueSince: null, cancelAtPeriodEnd: false, pendingPlanId: null, storefrontAddon: false, card: null,
  });
}

// ---- Gate (SUB-2/3): every request from agency staff passes through here --------------------------------------------------
const MODULE_PREFIXES: [prefix: string, module: PlanModule][] = [['crm.', 'crm'], ['accounting.', 'accounting'], ['payables.', 'accounting'], ['subAgencies.create', 'sub_agencies']];
/** Operations a suspended (read-only) tenant may still call: signing in, paying, demo tools and pure reads/prices. */
const READ_ONLY_ALLOWED = [/^auth\./, /^subscriptions\./, /^demo\./, /^search\./, /^reference\./, /^fx\./, /preview|simulate|quote|recheck/i];

export function planGate(db: Database, clock: DemoClock, p: Principal | null, op: OperationName, method: string): void {
  if (!p || p.user.userType !== 'staff' || p.org.type !== 'agency') return;
  const s = subscriptionFor(db, p.org);
  if (!s) return;
  const plan = db.get('subscriptionPlans', s.planId);
  if (!plan) return;
  const module = MODULE_PREFIXES.find(([prefix]) => op.startsWith(prefix))?.[1];
  if (module && !plan.modules.includes(module)) {
    throw new ApiException('PLAN_LIMIT_REACHED', `Your ${plan.name.en} plan does not include ${module}`, [{ issue: 'errors.PLAN_MODULE', params: { module, plan: plan.name.en } }]);
  }
  if (!subscriptionWritable(s.status) && method !== 'GET' && !READ_ONLY_ALLOWED.some((r) => r.test(op))) {
    throw new ApiException('ORG_NOT_ELIGIBLE', 'The subscription is suspended — data is read-only until it is paid', [{ issue: 'errors.SUBSCRIPTION_SUSPENDED' }]);
  }
  void clock;
}

/** SUB-3: limits are enforced on create (users, sub-agencies, monthly bookings). */
export function assertPlanLimit(ctx: RequestContext, org: OrganizationEntity, what: 'users' | 'subAgencies' | 'bookingsPerMonth'): void {
  const s = subscriptionFor(ctx.db, org);
  if (!s) return;
  const plan = ctx.db.get('subscriptionPlans', s.planId)!;
  const u = usageOf(ctx.db, s.tenantId, ctx.clock.today());
  const used = what === 'users' ? (org.parentId ? ctx.db.filter('memberships', (m) => m.tenantId === org.id && m.status === 'active').length : u.users) : what === 'subAgencies' ? u.subAgencies : u.bookingsThisMonth;
  if (!withinLimit(used, plan.limits[what])) {
    throw new ApiException('PLAN_LIMIT_REACHED', `Your ${plan.name.en} plan allows ${plan.limits[what]} ${what}`, [{ issue: 'errors.PLAN_LIMIT', params: { what, limit: plan.limits[what] ?? 0, plan: plan.name.en } }]);
  }
}
