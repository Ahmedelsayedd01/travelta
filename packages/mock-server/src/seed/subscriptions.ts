import { documentNumber } from '@travelta/domain';
import type { JournalEntryEntity, LedgerAccountEntity, FinancialAccountEntity, SubscriptionEntity, SubscriptionInvoiceEntity, SubscriptionPlanEntity } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import type { SeedContext } from './context';

/** SUB-1: three plans with DEMO prices (EGP) and the storefront add-on; one subscription per agency incl. a past_due one. */
export function seedSubscriptions(s: SeedContext, orgIds: Record<string, string>, orgNames: Record<string, string>, finance: { journalEntries: JournalEntryEntity[]; ledgerAccounts: LedgerAccountEntity[]; financialAccounts: FinancialAccountEntity[]; sequences: Record<string, number> }) {
  const plan = (key: string, en: string, ar: string, den: string, dar: string, monthly: number, yearly: number, limits: SubscriptionPlanEntity['limits'], modules: SubscriptionPlanEntity['modules'], storefrontIncluded: boolean, sort: number): SubscriptionPlanEntity => ({
    id: s.id('plan'), ...s.stamp(), key, name: { en, ar }, description: { en: den, ar: dar }, monthlyMinor: monthly * 100, yearlyMinor: yearly * 100, currency: 'EGP', limits, modules,
    storefrontIncluded, storefrontAddonMonthlyMinor: 75_000, active: true, sort, isDemoValue: true,
  });
  const plans = [
    plan('starter', 'Starter', 'البداية', 'For small offices: search, book and collect.', 'للمكاتب الصغيرة: البحث والحجز والتحصيل.', 1_500, 15_000, { users: 3, subAgencies: 0, bookingsPerMonth: 100 }, [], false, 1),
    plan('growth', 'Growth', 'النمو', 'CRM, accounting and up to 3 sub-agencies.', 'إدارة العملاء والمحاسبة وحتى ٣ وكالات فرعية.', 3_500, 35_000, { users: 10, subAgencies: 3, bookingsPerMonth: null }, ['crm', 'accounting', 'sub_agencies'], false, 2),
    plan('enterprise', 'Enterprise', 'المؤسسات', 'Unlimited users and sub-agencies, storefront included.', 'مستخدمون ووكالات فرعية بلا حدود مع المتجر الإلكتروني.', 8_500, 85_000, { users: null, subAgencies: null, bookingsPerMonth: null }, ['crm', 'accounting', 'sub_agencies'], true, 3),
  ];
  const [starter, growth, enterprise] = plans as [SubscriptionPlanEntity, SubscriptionPlanEntity, SubscriptionPlanEntity];
  const SUBS: [org: string, plan: SubscriptionPlanEntity, cycle: SubscriptionEntity['cycle'], status: SubscriptionEntity['status'], periodStartDaysAgo: number, card: SubscriptionEntity['card'], addon: boolean][] = [
    ['nile', enterprise, 'monthly', 'active', 18, { last4: '4242', brand: 'Visa', failing: false }, false],
    ['alnoor', growth, 'yearly', 'active', 120, { last4: '4444', brand: 'Mastercard', failing: false }, true],
    ['redsea', starter, 'monthly', 'trialing', 5, null, false],
    ['sunrise', growth, 'monthly', 'past_due', 33, { last4: '0002', brand: 'Visa', failing: true }, false],
  ];
  const subscriptions: SubscriptionEntity[] = [];
  const invoices: SubscriptionInvoiceEntity[] = [];
  const platform = orgIds.platform!;
  const acc = (key: string) => finance.ledgerAccounts.find((a) => a.tenantId === platform && a.systemKey === key)!.id;
  const card = finance.financialAccounts.find((f) => f.tenantId === platform && f.kind === 'card_gateway')!;
  const year = s.today.slice(0, 4);
  const invoice = (sub: SubscriptionEntity, p: SubscriptionPlanEntity, start: string, end: string, status: SubscriptionInvoiceEntity['status'], kind: SubscriptionInvoiceEntity['kind']) => {
    const n = (finance.sequences[`subInvoice:${year}`] = (finance.sequences[`subInvoice:${year}`] ?? 0) + 1);
    const lines = [{ description: `${p.name.en} — ${sub.cycle}`, amountMinor: sub.cycle === 'monthly' ? p.monthlyMinor : p.yearlyMinor }];
    if (sub.storefrontAddon && !p.storefrontIncluded) lines.push({ description: 'Storefront add-on', amountMinor: sub.cycle === 'monthly' ? p.storefrontAddonMonthlyMinor : p.storefrontAddonMonthlyMinor * 10 });
    const total = lines.reduce((a, l) => a + l.amountMinor, 0);
    const inv: SubscriptionInvoiceEntity = {
      id: s.id('sinv'), ...s.stamp(), tenantId: sub.tenantId, subscriptionId: sub.id, number: documentNumber('SUB', start, n), kind, lines, totalMinor: total, currency: 'EGP',
      status, periodStart: start, periodEnd: end, issuedAt: `${start}T06:00:00.000Z`, cardLast4: sub.card?.last4 ?? null,
    };
    invoices.push(inv);
    if (status === 'paid') {
      const jn = (finance.sequences[`journal:${platform}:${year}`] = (finance.sequences[`journal:${platform}:${year}`] ?? 0) + 1);
      finance.journalEntries.push({
        id: s.id('jnl'), ...s.stamp(), tenantId: platform, number: documentNumber('JE', start, jn), date: start, memo: `SaaS ${inv.number}`, source: 'payment', sourceId: inv.id, bookingId: null,
        postedByUserId: null, reversalOf: null, currency: 'EGP',
        lines: [{ accountId: card.ledgerAccountId, debitMinor: total, creditMinor: 0, party: null }, { accountId: acc('subscription_revenue'), debitMinor: 0, creditMinor: total, party: { kind: 'agency', id: sub.tenantId, name: orgNames[sub.tenantId] ?? sub.tenantId } }],
      });
    }
  };
  for (const [key, p, cycle, status, ago, cardOnFile, addon] of SUBS) {
    const days = cycle === 'monthly' ? 30 : 365;
    const start = addDays(s.today, -ago);
    const sub: SubscriptionEntity = {
      id: s.id('sub'), ...s.stamp(), tenantId: orgIds[key]!, planId: p.id, cycle, status,
      trialEndsAt: status === 'trialing' ? addDays(start, 14) : addDays(s.today, -ago - 14),
      currentPeriodStart: start, currentPeriodEnd: status === 'trialing' ? addDays(start, 14) : addDays(start, days),
      pastDueSince: status === 'past_due' ? addDays(start, days) : null, cancelAtPeriodEnd: false, pendingPlanId: null, storefrontAddon: addon, card: cardOnFile,
    };
    if (status === 'past_due') { sub.currentPeriodEnd = addDays(start, days); }
    subscriptions.push(sub);
    if (status === 'trialing') continue;
    // History: the two periods before the current one, then the current one (or the failed renewal for past_due).
    if (cycle === 'monthly') for (const k of [2, 1]) invoice(sub, p, addDays(start, -days * k), addDays(start, -days * (k - 1)), 'paid', k === 2 ? 'trial_conversion' : 'renewal');
    invoice(sub, p, start, addDays(start, days), 'paid', 'renewal');
    if (status === 'past_due') invoice(sub, p, addDays(start, days), addDays(start, days * 2), 'failed', 'renewal');
  }
  return { plans, subscriptions, invoices };
}
