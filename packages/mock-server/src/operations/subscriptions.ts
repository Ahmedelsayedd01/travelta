import { createId } from '@travelta/shared';
import { addDays } from '@travelta/shared';
import { ApiException, forbidden, notFound } from '../errors';
import { listPage } from '../query';
import { assertPermission, requirePrincipal } from '../security';
import { audit } from '../services/audit';
import { authorizeCard } from '../services/payments';
import { changePlan, payNow, requireOwnSubscription, setStorefrontAddon, subscriptionDto, subscriptionFor } from '../services/subscriptions';
import type { HandlerMap } from './types';

type Ops = 'subscriptions.access' | 'subscriptions.plans' | 'subscriptions.savePlan' | 'subscriptions.mine' | 'subscriptions.list' | 'subscriptions.changePlan' | 'subscriptions.setAddon'
  | 'subscriptions.setCancel' | 'subscriptions.updateCard' | 'subscriptions.payNow' | 'subscriptions.adminAction' | 'subscriptions.invoices';

const platformOnly = (ctx: Parameters<HandlerMap<Ops>['subscriptions.list']>[0], manage = false) => {
  const p = assertPermission(ctx, manage ? 'subscriptions.manage' : 'subscriptions.view');
  if (p.org.type !== 'platform') throw forbidden('Platform only');
  return p;
};

export const subscriptionHandlers: HandlerMap<Ops> = {
  'subscriptions.access': (ctx) => {
    const p = requirePrincipal(ctx);
    const s = p.user.userType === 'staff' ? subscriptionFor(ctx.db, p.org) : null;
    if (!s) return { planName: null, modules: null, status: null, writable: true, daysLeftInTrial: null, graceEndsAt: null, storefront: p.org.isPlatformRetail };
    const d = subscriptionDto(ctx.db, s, ctx.clock.today());
    return { planName: d.plan.name, modules: d.plan.modules, status: d.status, writable: d.writable, daysLeftInTrial: d.daysLeftInTrial, graceEndsAt: d.graceEndsAt, storefront: d.plan.storefrontIncluded || d.storefrontAddon };
  },
  'subscriptions.plans': (ctx) => {
    const p = requirePrincipal(ctx);
    return ctx.db.filter('subscriptionPlans', (x) => x.active || p.org.type === 'platform').sort((a, b) => a.sort - b.sort);
  },
  'subscriptions.savePlan': (ctx, input) => {
    platformOnly(ctx, true);
    if (ctx.db.find('subscriptionPlans', (x) => x.key === input.key && x.id !== input.id)) throw new ApiException('VALIDATION_ERROR', 'Key in use', [{ field: 'key', issue: 'validation.code_taken' }]);
    const now = ctx.clock.nowIso();
    const { id, ...fields } = input;
    if (id) {
      const prev = ctx.db.get('subscriptionPlans', id);
      if (!prev) throw notFound('Plan');
      if (!fields.active && ctx.db.find('subscriptions', (s) => s.planId === id && s.status !== 'cancelled')) throw new ApiException('CONFLICT', 'Plan has subscribers', [{ field: 'active', issue: 'validation.plan_in_use' }]);
      const next = { ...prev, ...fields, currency: prev.currency, isDemoValue: true, updatedAt: now, version: prev.version + 1 };
      ctx.db.replace('subscriptionPlans', next);
      audit(ctx, { tenantId: ctx.principal!.org.id, action: 'subscriptions.plan_updated', entity: 'subscriptionPlan', entityId: id, before: { monthly: prev.monthlyMinor, limits: prev.limits }, after: { monthly: next.monthlyMinor, limits: next.limits } });
      return next;
    }
    const sort = Math.max(0, ...ctx.db.all('subscriptionPlans').map((x) => x.sort)) + 1;
    const row = ctx.db.insert('subscriptionPlans', { id: createId('plan', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, ...fields, currency: 'EGP', sort, isDemoValue: true });
    audit(ctx, { tenantId: ctx.principal!.org.id, action: 'subscriptions.plan_created', entity: 'subscriptionPlan', entityId: row.id, after: { key: row.key } });
    return row;
  },
  'subscriptions.mine': (ctx) => {
    const p = assertPermission(ctx, 'subscriptions.view');
    const s = p.org.type === 'agency' ? subscriptionFor(ctx.db, p.org) : null;
    return {
      subscription: s ? subscriptionDto(ctx.db, s, ctx.clock.today()) : null,
      invoices: s && !p.org.parentId ? ctx.db.filter('subscriptionInvoices', (i) => i.subscriptionId === s.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)) : [],
      canManage: !!s && !p.org.parentId && p.permissions.has('subscriptions.manage'),
    };
  },
  'subscriptions.list': (ctx, query) => {
    platformOnly(ctx);
    const today = ctx.clock.today();
    return listPage(ctx.db.all('subscriptions').map((s) => subscriptionDto(ctx.db, s, today)), query, {
      search: (s) => [s.orgName, s.plan.name.en],
      sortable: { orgName: (s) => s.orgName, mrr: (s) => s.mrrMinor, periodEnd: (s) => s.currentPeriodEnd },
      defaultSort: 'orgName:asc',
      filters: { status: (s, v) => v.includes(s.status), plan: (s, v) => v.includes(s.planId) },
    });
  },
  'subscriptions.changePlan': (ctx, { planId, cycle }) => {
    const p = requirePrincipal(ctx);
    const s = requireOwnSubscription(ctx, p, true);
    if (s.status === 'suspended' || s.status === 'cancelled') throw new ApiException('INVALID_TRANSITION', 'Pay the outstanding balance first');
    const out = changePlan(ctx, s, planId, cycle);
    audit(ctx, { tenantId: s.tenantId, action: 'subscriptions.plan_changed', entity: 'subscription', entityId: s.id, before: { planId: s.planId }, after: { planId, effective: out.effective, charged: out.charged } });
    return { subscription: subscriptionDto(ctx.db, out.s, ctx.clock.today()), effective: out.effective, chargedMinor: out.charged };
  },
  'subscriptions.setAddon': (ctx, { storefront }) => {
    const p = requirePrincipal(ctx);
    const s = requireOwnSubscription(ctx, p, true);
    const out = setStorefrontAddon(ctx, s, storefront);
    audit(ctx, { tenantId: s.tenantId, action: 'subscriptions.addon_changed', entity: 'subscription', entityId: s.id, after: { storefront } });
    return { subscription: subscriptionDto(ctx.db, out.s, ctx.clock.today()), effective: 'now' as const, chargedMinor: out.charged };
  },
  'subscriptions.setCancel': (ctx, { cancelAtPeriodEnd }) => {
    const p = requirePrincipal(ctx);
    const s = requireOwnSubscription(ctx, p, true);
    if (s.status === 'cancelled') throw new ApiException('INVALID_TRANSITION', 'Already cancelled');
    const next = { ...s, cancelAtPeriodEnd, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
    ctx.db.replace('subscriptions', next);
    audit(ctx, { tenantId: s.tenantId, action: cancelAtPeriodEnd ? 'subscriptions.cancel_scheduled' : 'subscriptions.resumed', entity: 'subscription', entityId: s.id });
    return subscriptionDto(ctx.db, next, ctx.clock.today());
  },
  'subscriptions.updateCard': (ctx, card) => {
    const p = requirePrincipal(ctx);
    const s = requireOwnSubscription(ctx, p, true);
    const n = card.number.replace(/\s/g, '');
    // SIMULATION: 4000 0000 0000 0002 is accepted on file but every charge declines (to demo past_due).
    const failing = n === '4000000000000002';
    const { last4 } = failing ? { last4: n.slice(-4) } : authorizeCard({ number: n });
    const next = { ...s, card: { last4, brand: n.startsWith('5') ? 'Mastercard' : 'Visa', failing }, updatedAt: ctx.clock.nowIso(), version: s.version + 1 };
    ctx.db.replace('subscriptions', next);
    audit(ctx, { tenantId: s.tenantId, action: 'subscriptions.card_updated', entity: 'subscription', entityId: s.id, after: { last4 } });
    return subscriptionDto(ctx.db, next, ctx.clock.today());
  },
  'subscriptions.payNow': (ctx) => {
    const p = requirePrincipal(ctx);
    const s = requireOwnSubscription(ctx, p, true);
    return subscriptionDto(ctx.db, payNow(ctx, s), ctx.clock.today());
  },
  'subscriptions.adminAction': (ctx, { subscriptionId, action }) => {
    platformOnly(ctx, true);
    const s = ctx.db.get('subscriptions', subscriptionId);
    if (!s) throw notFound('Subscription');
    const today = ctx.clock.today();
    const now = ctx.clock.nowIso();
    let next = s;
    if (action === 'extend_trial') {
      if (s.status !== 'trialing') throw new ApiException('INVALID_TRANSITION', 'Only trials can be extended');
      const end = addDays(s.trialEndsAt ?? today, 7);
      next = { ...s, trialEndsAt: end, currentPeriodEnd: end };
    } else if (action === 'suspend') {
      if (s.status === 'suspended' || s.status === 'cancelled') throw new ApiException('INVALID_TRANSITION', `Subscription is ${s.status}`);
      next = { ...s, status: 'suspended', pastDueSince: s.pastDueSince ?? today };
    } else {
      if (s.status !== 'suspended' && s.status !== 'past_due' && s.status !== 'cancelled') throw new ApiException('INVALID_TRANSITION', `Subscription is ${s.status}`);
      next = { ...s, status: 'active', pastDueSince: null, cancelAtPeriodEnd: false, currentPeriodStart: today, currentPeriodEnd: addDays(today, s.cycle === 'monthly' ? 30 : 365) };
    }
    next = { ...next, updatedAt: now, version: s.version + 1 };
    ctx.db.replace('subscriptions', next);
    audit(ctx, { tenantId: s.tenantId, action: `subscriptions.${action}`, entity: 'subscription', entityId: s.id, before: { status: s.status }, after: { status: next.status } });
    return subscriptionDto(ctx.db, next, today);
  },
  'subscriptions.invoices': (ctx, query) => {
    platformOnly(ctx);
    const rows = ctx.db.all('subscriptionInvoices').map((i) => ({ ...i, orgName: ctx.db.get('organizations', i.tenantId)?.name.en ?? '—' }));
    return listPage(rows, query, { search: (i) => [i.number, i.orgName], sortable: { issuedAt: (i) => i.issuedAt, total: (i) => i.totalMinor }, defaultSort: 'issuedAt:desc', filters: { status: (i, v) => v.includes(i.status) } });
  },
};
