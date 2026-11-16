import { ageingBucket, isFollowUpOverdue } from '@travelta/domain';
import type { BookingEntity, BookingItemEntity, Dashboard, Kpi, Report, ReportKey } from '@travelta/schemas';
import { FINANCIAL_REPORTS } from '@travelta/schemas';
import { addDays, diffDays } from '@travelta/shared';
import type { RequestContext } from '../context';
import { forbidden } from '../errors';
import type { Principal } from '../security';
import { canSeeBooking } from './booking';
import { dueOf, moneyIn } from './finance/money';
import { ledgerTenant } from './finance/ledger';
import { subscriptionDto } from './subscriptions';
import { walletDto } from './finance/wallet';

type Audience = Dashboard['audience'];
const LIVE = (s: string) => s !== 'cancelled' && s !== 'rejected';

export function audienceOfReports(p: Principal): Audience {
  if (p.user.userType !== 'staff') throw forbidden('Reports are for staff');
  if (!p.permissions.has('reports.view')) throw forbidden('Missing permission: reports.view');
  return p.org.type === 'platform' ? 'platform' : p.org.type === 'supplier' ? 'supplier' : 'agency';
}

export function resolveRange(ctx: RequestContext, r: { from?: string; to?: string }) {
  const to = r.to ?? ctx.clock.today();
  const from = r.from ?? addDays(to, -29);
  const len = Math.max(1, diffDays(from, to) + 1);
  return { from, to, prevFrom: addDays(from, -len), prevTo: addDays(from, -1) };
}
const inRange = (iso: string, from: string, to: string) => iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
const pct = (now: number, before: number) => (before === 0 ? (now === 0 ? 0 : null) : Math.round(((now - before) / Math.abs(before)) * 1000) / 10);
const months = (today: string) => Array.from({ length: 6 }, (_, i) => {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - (5 - i));
  return d.toISOString().slice(0, 7);
});

/** Bookings the caller may see; suppliers see the bookings containing their items. */
function scopedBookings(ctx: RequestContext, p: Principal): BookingEntity[] {
  return ctx.db.filter('bookings', (b) => canSeeBooking(ctx, p, b));
}
function supplierItems(ctx: RequestContext, p: Principal): BookingItemEntity[] {
  return ctx.db.filter('bookingItems', (i) => i.supplierOrgId === p.org.id);
}

/** Ledger figures per booking for a tenant: revenue and cost from posted entries (profit is never estimated, ACC-3). */
function ledgerByBooking(ctx: RequestContext, tenantId: string) {
  const types = new Map(ctx.db.filter('ledgerAccounts', (a) => a.tenantId === tenantId).map((a) => [a.id, a.type]));
  const out = new Map<string, { revenue: number; cost: number }>();
  for (const e of ctx.db.filter('journalEntries', (j) => j.tenantId === tenantId && j.bookingId !== null)) {
    const row = out.get(e.bookingId!) ?? { revenue: 0, cost: 0 };
    for (const l of e.lines) {
      const t = types.get(l.accountId);
      if (t === 'revenue') row.revenue += l.creditMinor - l.debitMinor;
      if (t === 'expense') row.cost += l.debitMinor - l.creditMinor;
    }
    out.set(e.bookingId!, row);
  }
  return out;
}

const CASH_KEYS = new Set(['cash', 'bank', 'vodafone_cash', 'instapay', 'card_clearing']);

/** The profit KPI explained line by line (same journal lines as ledgerTotals). */
function profitBreakdown(ctx: RequestContext, tenantId: string, from: string, to: string): NonNullable<Dashboard['profitBreakdown']> {
  const accounts = new Map(ctx.db.filter('ledgerAccounts', (a) => a.tenantId === tenantId).map((a) => [a.id, a]));
  const revenue = new Map<string, number>();
  const expense = new Map<string, number>();
  let cogs = 0;
  let cash = 0;
  const entries = ctx.db.filter('journalEntries', (j) => j.tenantId === tenantId && j.date >= from && j.date <= to);
  for (const e of entries) {
    for (const l of e.lines) {
      const a = accounts.get(l.accountId);
      if (!a) continue;
      if (a.type === 'revenue') revenue.set(a.id, (revenue.get(a.id) ?? 0) + l.creditMinor - l.debitMinor);
      if (a.type === 'expense') {
        if (a.systemKey === 'cost_of_sales') cogs += l.debitMinor - l.creditMinor;
        else expense.set(a.id, (expense.get(a.id) ?? 0) + l.debitMinor - l.creditMinor);
      }
      if (a.systemKey && CASH_KEYS.has(a.systemKey)) cash += l.debitMinor - l.creditMinor;
    }
  }
  const rows = (m: Map<string, number>) => [...m.entries()].filter(([, v]) => v !== 0).map(([id, amountMinor]) => ({ name: accounts.get(id)!.name, amountMinor })).sort((a, b) => b.amountMinor - a.amountMinor);
  const revenueMinor = [...revenue.values()].reduce((s, v) => s + v, 0);
  const operatingExpensesMinor = [...expense.values()].reduce((s, v) => s + v, 0);
  return {
    revenueMinor, revenueByAccount: rows(revenue), costOfSalesMinor: cogs, grossProfitMinor: revenueMinor - cogs,
    operatingExpensesMinor, expensesByAccount: rows(expense), netProfitMinor: revenueMinor - cogs - operatingExpensesMinor, cashChangeMinor: cash, journalEntries: entries.length,
  };
}

function ledgerTotals(ctx: RequestContext, tenantId: string, from: string, to: string) {
  const types = new Map(ctx.db.filter('ledgerAccounts', (a) => a.tenantId === tenantId).map((a) => [a.id, a.type]));
  let revenue = 0;
  let expense = 0;
  for (const e of ctx.db.filter('journalEntries', (j) => j.tenantId === tenantId && j.date >= from && j.date <= to)) {
    for (const l of e.lines) {
      const t = types.get(l.accountId);
      if (t === 'revenue') revenue += l.creditMinor - l.debitMinor;
      if (t === 'expense') expense += l.debitMinor - l.creditMinor;
    }
  }
  return { revenue, expense, profit: revenue - expense };
}

// ---- Dashboards --------------------------------------------------------------------------------------------------------------
export function dashboard(ctx: RequestContext, p: Principal, range: { from?: string; to?: string }): Dashboard {
  const audience = audienceOfReports(p);
  const { from, to, prevFrom, prevTo } = resolveRange(ctx, range);
  const today = ctx.clock.today();
  const currency = ctx.db.get('organizations', p.org.id)?.baseCurrency ?? 'EGP';
  const kpi = (key: string, value: number, kind: Kpi['kind'], before: number | null = null, tone: Kpi['tone'] = 'neutral'): Kpi => ({ key, value, kind, deltaPct: before === null ? null : pct(value, before), tone });
  const month = months(today);

  if (audience === 'supplier') {
    const items = supplierItems(ctx, p);
    const live = items.filter((i) => LIVE(i.status));
    const payout = (xs: BookingItemEntity[]) => xs.reduce((s, i) => s + i.breakdown.settlement.supplierPayoutMinor, 0);
    const cur = live.filter((i) => inRange(i.createdAt, from, to));
    const prev = live.filter((i) => inRange(i.createdAt, prevFrom, prevTo));
    const pending = items.filter((i) => i.status === 'pending' && i.holdReason === 'awaiting_supplier');
    const payables = ctx.db.filter('supplierPayables', (x) => x.supplierRefId === p.org.id);
    const confirmedOrRejected = items.filter((i) => i.status !== 'pending' && i.status !== 'cancelled');
    const rate = confirmedOrRejected.length ? (confirmedOrRejected.filter((i) => i.status !== 'rejected').length / confirmedOrRejected.length) * 100 : 100;
    const byProduct = new Map<string, { name: string; value: number; count: number }>();
    for (const i of live) {
      const key = i.productId ?? i.title.en;
      const r = byProduct.get(key) ?? { name: i.title.en, value: 0, count: 0 };
      r.value += i.breakdown.settlement.supplierPayoutMinor; r.count += 1;
      byProduct.set(key, r);
    }
    return {
      audience, currency, from, to,
      kpis: [
        kpi('reservations', cur.length, 'number', prev.length), kpi('payout', payout(cur), 'money', payout(prev)),
        kpi('pendingConfirmations', pending.length, 'number', null, pending.length ? 'warning' : 'neutral'),
        kpi('confirmationRate', Math.round(rate * 10) / 10, 'percent', null, rate < 90 ? 'warning' : 'good'),
        kpi('openPayables', payables.filter((x) => x.status === 'open' || x.status === 'partially_paid').reduce((s, x) => s + x.amountDueMinor - x.amountPaidMinor, 0), 'money'),
      ],
      trend: { key: 'payout', kind: 'money', points: month.map((m) => ({ label: m, value: payout(live.filter((i) => i.createdAt.slice(0, 7) === m)) })) },
      byService: { key: 'reservations', kind: 'number', points: [...new Set(live.map((i) => i.serviceType))].map((sv) => ({ label: sv, value: live.filter((i) => i.serviceType === sv).length })) },
      top: { key: 'products', rows: [...byProduct.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.value - a.value).slice(0, 5) },
      attention: [
        { key: 'pendingConfirmations', count: pending.length, link: '/supplier/reservations' },
        { key: 'overduePayables', count: payables.filter((x) => (x.status === 'open' || x.status === 'partially_paid') && x.dueDate < today).length, link: '/supplier/statement' },
      ].filter((a) => a.count > 0),
      profitBreakdown: null,
    };
  }

  const bookings = scopedBookings(ctx, p);
  const live = bookings.filter((b) => b.status !== 'cancelled');
  const cur = live.filter((b) => inRange(b.createdAt, from, to));
  const prev = live.filter((b) => inRange(b.createdAt, prevFrom, prevTo));
  const gmv = (xs: BookingEntity[]) => xs.reduce((s, b) => s + b.totals.sellMinor, 0);
  const items = ctx.db.filter('bookingItems', (i) => LIVE(i.status) && cur.some((b) => b.id === i.bookingId));
  const byService = [...new Set(items.map((i) => i.serviceType))].map((sv) => ({ label: sv, value: items.filter((i) => i.serviceType === sv).reduce((s, i) => s + i.breakdown.totals.customerTotalMinor, 0) }));
  const trend = { key: 'sales', kind: 'money' as const, points: month.map((m) => ({ label: m, value: gmv(live.filter((b) => b.createdAt.slice(0, 7) === m)) })) };
  const ledger = ledgerTenant(ctx.db, p.org.id);
  const pnl = p.permissions.has('reports.view_financial') ? ledgerTotals(ctx, ledger, from, to) : null;
  const pnlPrev = pnl ? ledgerTotals(ctx, ledger, prevFrom, prevTo) : null;
  const breakdown = pnl ? profitBreakdown(ctx, ledger, from, to) : null;

  if (audience === 'platform') {
    const subs = ctx.db.all('subscriptions').map((s) => subscriptionDto(ctx.db, s, today));
    const agencies = new Map<string, { name: string; value: number; count: number }>();
    for (const b of cur) {
      const org = ctx.db.get('organizations', b.tenantId);
      const r = agencies.get(b.tenantId) ?? { name: org?.name.en ?? '—', value: 0, count: 0 };
      r.value += b.totals.sellMinor; r.count += 1;
      agencies.set(b.tenantId, r);
    }
    const awaitingCredit = ctx.db.filter('walletHolds', (h) => h.status === 'active' && h.awaitingApproval && ctx.db.get('wallets', h.walletId)?.heldAtOrgId === p.org.id).length;
    const pendingTopUps = ctx.db.filter('topUpRequests', (t) => t.status === 'pending' && ctx.db.get('wallets', t.walletId)?.heldAtOrgId === p.org.id).length;
    const kyc = ctx.db.filter('kycCases', (k) => k.status === 'submitted' || k.status === 'in_review').length;
    return {
      audience, currency, from, to,
      kpis: [
        kpi('gmv', gmv(cur), 'money', gmv(prev)), kpi('bookings', cur.length, 'number', prev.length),
        ...(pnl ? [kpi('platformProfit', pnl.profit, 'money', pnlPrev!.profit, pnl.profit < 0 ? 'critical' : 'good')] : []),
        kpi('mrr', subs.reduce((s, x) => s + x.mrrMinor, 0), 'money'),
        kpi('activeAgencies', ctx.db.filter('organizations', (o) => o.type === 'agency' && o.status === 'active' && !o.isPlatformRetail).length, 'number'),
      ],
      trend, byService: { key: 'sales', kind: 'money', points: byService },
      top: { key: 'agencies', rows: [...agencies.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.value - a.value).slice(0, 5) },
      attention: [
        { key: 'kycQueue', count: kyc, link: '/admin/kyc' },
        { key: 'creditApprovals', count: awaitingCredit, link: '/admin/bookings' },
        { key: 'topUps', count: pendingTopUps, link: '/admin/wallets' },
        { key: 'pastDueSubscriptions', count: subs.filter((s) => s.status === 'past_due' || s.status === 'suspended').length, link: '/admin/subscriptions' },
      ].filter((a) => a.count > 0),
      profitBreakdown: breakdown,
    };
  }

  // Agency (and sub-agency).
  const customers = new Map<string, { name: string; value: number; count: number }>();
  for (const b of cur) {
    if (!b.customerId) continue;
    const r = customers.get(b.customerId) ?? { name: ctx.db.get('customers', b.customerId)?.name ?? '—', value: 0, count: 0 };
    r.value += b.totals.sellMinor; r.count += 1;
    customers.set(b.customerId, r);
  }
  const outstanding = live.reduce((s, b) => { const m = moneyIn(ctx.db, b.id); return s + Math.max(0, dueOf(ctx.db, b) - (m.paid - m.refunded)); }, 0);
  const overdue = ctx.db.filter('paymentPlans', (x) => live.some((b) => b.id === x.bookingId)).reduce((s, x) => s + x.installments.filter((i) => i.status !== 'paid' && i.status !== 'cancelled' && i.dueDate < today).length, 0);
  const wallet = ctx.db.find('wallets', (w) => w.tenantId === p.org.id);
  const now = ctx.clock.nowIso();
  const followUps = ctx.db.filter('followUps', (f) => f.tenantId === p.org.id && f.assigneeUserId === p.user.id && isFollowUpOverdue(f, now)).length;
  return {
    audience, currency, from, to,
    kpis: [
      kpi('sales', gmv(cur), 'money', gmv(prev)), kpi('bookings', cur.length, 'number', prev.length),
      ...(pnl ? [kpi('profit', pnl.profit, 'money', pnlPrev!.profit, pnl.profit < 0 ? 'critical' : 'good')] : []),
      ...(p.permissions.has('payments.view') ? [kpi('outstanding', outstanding, 'money', null, outstanding > 0 ? 'warning' : 'neutral')] : []),
      ...(wallet && p.permissions.has('wallet.view') ? [kpi('walletAvailable', walletDto(ctx.db, wallet).availableMinor, 'money', null, walletDto(ctx.db, wallet).availableMinor < 0 ? 'critical' : 'neutral')] : []),
    ],
    trend, byService: { key: 'sales', kind: 'money', points: byService },
    top: { key: 'customers', rows: [...customers.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.value - a.value).slice(0, 5) },
    attention: [
      { key: 'overdueInstallments', count: overdue, link: '/agency/payments' },
      { key: 'pendingItems', count: ctx.db.filter('bookingItems', (i) => i.status === 'pending' && live.some((b) => b.id === i.bookingId)).length, link: '/agency/bookings' },
      { key: 'overdueFollowUps', count: followUps, link: '/agency/crm/follow-ups' },
      { key: 'pendingCancellations', count: ctx.db.filter('cancellations', (c) => c.tenantId === p.org.id && c.status === 'requested').length, link: '/agency/payments' },
    ].filter((a) => a.count > 0),
      profitBreakdown: breakdown,
  };
}

// ---- Reports -------------------------------------------------------------------------------------------------------------------
export function availableReports(p: Principal): ReportKey[] {
  const audience = audienceOfReports(p);
  const byAudience: Record<Audience, ReportKey[]> = {
    platform: ['sales', 'bookings', 'profit', 'margins', 'ageing', 'payables', 'agencies', 'suppliers'],
    agency: ['sales', 'bookings', 'profit', 'margins', 'ageing', 'payables', 'agents', 'suppliers'],
    supplier: ['bookings', 'payables'],
  };
  return byAudience[audience].filter((k) => !FINANCIAL_REPORTS.includes(k) || p.permissions.has('reports.view_financial'));
}

export function runReport(ctx: RequestContext, p: Principal, key: ReportKey, range: { from?: string; to?: string }): Report {
  if (!availableReports(p).includes(key)) throw forbidden(`Report ${key} is not available to you`);
  const { from, to } = resolveRange(ctx, range);
  const today = ctx.clock.today();
  const currency = ctx.db.get('organizations', p.org.id)?.baseCurrency ?? 'EGP';
  const audience = audienceOfReports(p);
  const bookings = audience === 'supplier' ? [] : scopedBookings(ctx, p).filter((b) => inRange(b.createdAt, from, to));
  const items = (b: BookingEntity) => ctx.db.filter('bookingItems', (i) => i.bookingId === b.id);
  const org = (id: string) => ctx.db.get('organizations', id)?.name.en ?? '—';
  const base = { key, currency, from, to };
  const sum = (rows: Record<string, unknown>[], cols: string[]) => Object.fromEntries(cols.map((c) => [c, rows.reduce((s, r) => s + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0)]));
  const bookingPath = (b: BookingEntity) => (p.org.type === 'platform' ? `/admin/bookings/${b.id}` : `/agency/bookings/${b.id}`);

  switch (key) {
    case 'sales': {
      const rows = bookings.map((b) => {
        const m = moneyIn(ctx.db, b.id);
        return {
          ref: b.ref, date: b.createdAt.slice(0, 10), customer: b.customerId ? ctx.db.get('customers', b.customerId)?.name ?? b.leadTraveller : b.leadTraveller,
          seller: org(b.tenantId), services: [...new Set(items(b).map((i) => i.serviceType))].join(', '), status: b.status,
          sell: b.status === 'cancelled' ? 0 : b.totals.sellMinor, tax: b.status === 'cancelled' ? 0 : b.totals.taxMinor, paid: m.paid - m.refunded,
          outstanding: Math.max(0, dueOf(ctx.db, b) - (m.paid - m.refunded)),
        };
      });
      return { ...base, columns: [{ key: 'ref', type: 'text' }, { key: 'date', type: 'date' }, { key: 'customer', type: 'text' }, ...(audience === 'platform' ? [{ key: 'seller', type: 'text' as const }] : []), { key: 'services', type: 'text' }, { key: 'status', type: 'text' }, { key: 'sell', type: 'money' }, { key: 'tax', type: 'money' }, { key: 'paid', type: 'money' }, { key: 'outstanding', type: 'money' }],
        rows, totals: sum(rows, ['sell', 'tax', 'paid', 'outstanding']), links: bookings.map(bookingPath) };
    }
    case 'bookings': {
      const all = audience === 'supplier' ? supplierItems(ctx, p).filter((i) => inRange(i.createdAt, from, to)) : bookings.flatMap(items);
      const services = [...new Set(all.map((i) => i.serviceType))].sort();
      const rows = services.map((sv) => {
        const xs = all.filter((i) => i.serviceType === sv);
        const cancelled = xs.filter((i) => i.status === 'cancelled').length;
        const rejected = xs.filter((i) => i.status === 'rejected').length;
        const value = xs.filter((i) => LIVE(i.status)).reduce((s, i) => s + (audience === 'supplier' ? i.breakdown.settlement.supplierPayoutMinor : i.breakdown.totals.customerTotalMinor), 0);
        return { service: sv, items: xs.length, confirmed: xs.filter((i) => ['confirmed', 'vouchered', 'travelled', 'no_show'].includes(i.status)).length, pending: xs.filter((i) => i.status === 'pending').length, cancelled, rejected, cancellationRate: xs.length ? Math.round(((cancelled + rejected) / xs.length) * 1000) / 10 : 0, value };
      });
      return { ...base, columns: [{ key: 'service', type: 'text' }, { key: 'items', type: 'number' }, { key: 'confirmed', type: 'number' }, { key: 'pending', type: 'number' }, { key: 'cancelled', type: 'number' }, { key: 'rejected', type: 'number' }, { key: 'cancellationRate', type: 'percent' }, { key: 'value', type: 'money' }],
        rows, totals: sum(rows, ['items', 'confirmed', 'pending', 'cancelled', 'rejected', 'value']), links: rows.map(() => null) };
    }
    case 'profit': {
      const tenant = ledgerTenant(ctx.db, p.org.id);
      const ledger = ledgerByBooking(ctx, tenant);
      const rows = bookings.filter((b) => ledger.has(b.id)).map((b) => {
        const l = ledger.get(b.id)!;
        return { ref: b.ref, date: b.createdAt.slice(0, 10), customer: b.customerId ? ctx.db.get('customers', b.customerId)?.name ?? b.leadTraveller : b.leadTraveller, status: b.status, revenue: l.revenue, cost: l.cost, profit: l.revenue - l.cost, margin: l.revenue ? Math.round(((l.revenue - l.cost) / l.revenue) * 1000) / 10 : 0 };
      });
      const kept = bookings.filter((b) => ledger.has(b.id));
      return { ...base, columns: [{ key: 'ref', type: 'text' }, { key: 'date', type: 'date' }, { key: 'customer', type: 'text' }, { key: 'status', type: 'text' }, { key: 'revenue', type: 'money' }, { key: 'cost', type: 'money' }, { key: 'profit', type: 'money' }, { key: 'margin', type: 'percent' }],
        rows, totals: sum(rows, ['revenue', 'cost', 'profit']), links: kept.map(bookingPath) };
    }
    case 'margins': {
      const flat = bookings.flatMap((b) => items(b).filter((i) => LIVE(i.status)).map((i) => ({ b, i })));
      const rows = flat.map(({ b, i }) => {
        const s = i.breakdown.settlement;
        const own = audience === 'platform' ? s.platformRevenueMinor + (s.commissionBeneficiary === 'platform' ? s.commissionMinor : 0)
          : (b.tenantId === p.org.id ? (ctx.db.get('organizations', b.tenantId)?.parentId ? s.subAgencyRevenueMinor : s.agencyRevenueMinor) : s.agencyRevenueMinor) + (s.commissionBeneficiary === 'agency' ? s.commissionMinor : 0);
        const sell = i.breakdown.totals.customerTotalMinor - i.breakdown.totals.taxMinor;
        return {
          ref: `${b.ref}·${i.seq}`, item: i.title.en, service: i.serviceType, sell,
          ...(audience === 'platform' ? { net: i.breakdown.totals.netMinor, platform: s.platformRevenueMinor, agency: s.agencyRevenueMinor + s.subAgencyRevenueMinor, commission: s.commissionMinor } : { cost: i.breakdown.buyPrices.subAgencyBuyMinor ?? i.breakdown.buyPrices.agencyBuyMinor }),
          earned: own, margin: sell ? Math.round((own / sell) * 1000) / 10 : 0,
        };
      });
      const moneyCols = audience === 'platform' ? ['sell', 'net', 'platform', 'agency', 'commission', 'earned'] : ['sell', 'cost', 'earned'];
      return { ...base, columns: [{ key: 'ref', type: 'text' }, { key: 'item', type: 'text' }, { key: 'service', type: 'text' }, ...moneyCols.map((k) => ({ key: k, type: 'money' as const })), { key: 'margin', type: 'percent' }],
        rows, totals: sum(rows, moneyCols), links: flat.map(({ b }) => bookingPath(b)) };
    }
    case 'ageing': {
      const tenant = ledgerTenant(ctx.db, p.org.id);
      const map = new Map<string, Record<string, number | string>>();
      for (const b of ctx.db.filter('bookings', (x) => ledgerTenant(ctx.db, x.tenantId) === tenant && x.status !== 'cancelled' && canSeeBooking(ctx, p, x))) {
        const plan = ctx.db.find('paymentPlans', (x) => x.bookingId === b.id);
        if (!plan) continue;
        const k = b.customerId ?? b.id;
        const row = map.get(k) ?? { customer: b.customerId ? ctx.db.get('customers', b.customerId)?.name ?? b.leadTraveller : b.leadTraveller, current: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
        for (const i of plan.installments) {
          const open = i.status === 'cancelled' ? 0 : i.amountMinor - i.paidMinor;
          if (open <= 0) continue;
          const bucket = ageingBucket(diffDays(i.dueDate, today));
          row[bucket] = (row[bucket] as number) + open;
          row.total = (row.total as number) + open;
        }
        if ((row.total as number) > 0) map.set(k, row);
      }
      const rows = [...map.values()].sort((a, b) => (b.total as number) - (a.total as number));
      const cols = ['current', 'd0_30', 'd31_60', 'd61_90', 'd90_plus', 'total'];
      return { ...base, from: null, to: null, columns: [{ key: 'customer', type: 'text' }, ...cols.map((c) => ({ key: c, type: 'money' as const }))], rows, totals: sum(rows, cols), links: rows.map(() => null) };
    }
    case 'payables': {
      const list = audience === 'supplier' ? ctx.db.filter('supplierPayables', (x) => x.supplierRefId === p.org.id) : ctx.db.filter('supplierPayables', (x) => x.tenantId === ledgerTenant(ctx.db, p.org.id));
      const groups = new Map<string, Record<string, number | string>>();
      for (const x of list) {
        const k = audience === 'supplier' ? x.tenantId : x.supplierRefId;
        const row = groups.get(k) ?? { party: audience === 'supplier' ? org(x.tenantId) : x.supplierName, kind: x.supplierKind, items: 0, due: 0, paid: 0, open: 0, overdue: 0 };
        const open = x.status === 'cancelled' ? 0 : x.amountDueMinor - x.amountPaidMinor;
        row.items = (row.items as number) + 1;
        row.due = (row.due as number) + x.amountDueMinor;
        row.paid = (row.paid as number) + x.amountPaidMinor;
        row.open = (row.open as number) + Math.max(0, open);
        if (open > 0 && x.dueDate < today) row.overdue = (row.overdue as number) + open;
        groups.set(k, row);
      }
      const rows = [...groups.values()].sort((a, b) => (b.open as number) - (a.open as number));
      return { ...base, from: null, to: null, columns: [{ key: 'party', type: 'text' }, { key: 'kind', type: 'text' }, { key: 'items', type: 'number' }, { key: 'due', type: 'money' }, { key: 'paid', type: 'money' }, { key: 'open', type: 'money' }, { key: 'overdue', type: 'money' }], rows, totals: sum(rows, ['items', 'due', 'paid', 'open', 'overdue']), links: rows.map(() => null) };
    }
    case 'agencies': {
      const rows = ctx.db.filter('organizations', (o) => o.type === 'agency').map((o) => {
        const xs = bookings.filter((b) => b.tenantId === o.id && b.status !== 'cancelled');
        const its = xs.flatMap(items).filter((i) => LIVE(i.status));
        const w = ctx.db.find('wallets', (x) => x.tenantId === o.id);
        const wd = w ? walletDto(ctx.db, w) : null;
        return { agency: o.name.en, status: o.status, bookings: xs.length, gmv: xs.reduce((s, b) => s + b.totals.sellMinor, 0), platformRevenue: its.reduce((s, i) => s + i.breakdown.settlement.platformRevenueMinor, 0), walletBalance: wd?.balanceMinor ?? 0, creditUsed: wd?.creditUsedMinor ?? 0 };
      }).sort((a, b) => b.gmv - a.gmv);
      return { ...base, columns: [{ key: 'agency', type: 'text' }, { key: 'status', type: 'text' }, { key: 'bookings', type: 'number' }, { key: 'gmv', type: 'money' }, { key: 'platformRevenue', type: 'money' }, { key: 'walletBalance', type: 'money' }, { key: 'creditUsed', type: 'money' }], rows, totals: sum(rows, ['bookings', 'gmv', 'platformRevenue', 'creditUsed']), links: rows.map(() => null) };
    }
    case 'agents': {
      const members = ctx.db.filter('memberships', (m) => m.tenantId === p.org.id && m.status === 'active');
      const rows = members.map((m) => {
        const u = ctx.db.get('users', m.userId)!;
        const xs = bookings.filter((b) => b.createdByUserId === u.id && b.status !== 'cancelled');
        const reqs = ctx.db.filter('crmRequests', (r) => r.tenantId === p.org.id && r.assigneeUserId === u.id && inRange(r.stageChangedAt, from, to));
        const closed = reqs.filter((r) => r.stage === 'won' || r.stage === 'lost');
        const sales = xs.reduce((s, b) => s + b.totals.sellMinor, 0);
        return { agent: u.name, bookings: xs.length, sales, average: xs.length ? Math.round(sales / xs.length) : 0, won: reqs.filter((r) => r.stage === 'won').length, lost: reqs.filter((r) => r.stage === 'lost').length, conversion: closed.length ? Math.round((reqs.filter((r) => r.stage === 'won').length / closed.length) * 1000) / 10 : 0 };
      }).sort((a, b) => b.sales - a.sales);
      return { ...base, columns: [{ key: 'agent', type: 'text' }, { key: 'bookings', type: 'number' }, { key: 'sales', type: 'money' }, { key: 'average', type: 'money' }, { key: 'won', type: 'number' }, { key: 'lost', type: 'number' }, { key: 'conversion', type: 'percent' }], rows, totals: sum(rows, ['bookings', 'sales', 'won', 'lost']), links: rows.map(() => null) };
    }
    case 'suppliers': {
      const all = bookings.flatMap(items);
      const groups = new Map<string, BookingItemEntity[]>();
      for (const i of all) groups.set(i.supplierName, [...(groups.get(i.supplierName) ?? []), i]);
      const rows = [...groups.entries()].map(([name, xs]) => {
        const decided = xs.filter((i) => i.confirmedAt || i.status === 'rejected');
        const hours = xs.filter((i) => i.confirmedAt).map((i) => (Date.parse(i.confirmedAt!) - Date.parse(i.createdAt)) / 3_600_000);
        return {
          supplier: name, source: xs[0]!.source === 'manual' ? xs[0]!.ownership : xs[0]!.source, items: xs.length,
          confirmRate: decided.length ? Math.round((xs.filter((i) => i.confirmedAt).length / decided.length) * 1000) / 10 : 0,
          avgConfirmHours: hours.length ? Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10 : 0,
          rejected: xs.filter((i) => i.status === 'rejected').length, cancelled: xs.filter((i) => i.status === 'cancelled').length,
          cost: xs.filter((i) => LIVE(i.status)).reduce((s, i) => s + (audience === 'platform' ? i.breakdown.totals.netMinor : i.breakdown.buyPrices.agencyBuyMinor), 0),
        };
      }).sort((a, b) => b.items - a.items);
      return { ...base, columns: [{ key: 'supplier', type: 'text' }, { key: 'source', type: 'text' }, { key: 'items', type: 'number' }, { key: 'confirmRate', type: 'percent' }, { key: 'avgConfirmHours', type: 'number' }, { key: 'rejected', type: 'number' }, { key: 'cancelled', type: 'number' }, { key: 'cost', type: 'money' }], rows, totals: sum(rows, ['items', 'rejected', 'cancelled', 'cost']), links: rows.map(() => null) };
    }
  }
}
