import { assertBalanced, documentNumber, UnbalancedEntryError } from '@travelta/domain';
import type { FinancialAccountEntity, JournalEntryEntity, JournalLine, LedgerAccountEntity, LedgerSystemKey } from '@travelta/schemas';
import type { FINANCIAL_ACCOUNT_KINDS } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../../context';
import type { Database } from '../../db/database';
import { ApiException } from '../../errors';

type Kind = (typeof FINANCIAL_ACCOUNT_KINDS)[number];

/** The seeded chart of accounts every tenant ledger gets (ACC-2 posting rules address accounts by `systemKey`). */
export const CHART: { key: LedgerSystemKey; code: string; type: LedgerAccountEntity['type']; en: string; ar: string }[] = [
  { key: 'cash', code: '1000', type: 'asset', en: 'Cash on hand', ar: 'النقدية بالصندوق' },
  { key: 'bank', code: '1010', type: 'asset', en: 'Bank account', ar: 'الحساب البنكي' },
  { key: 'vodafone_cash', code: '1020', type: 'asset', en: 'Vodafone Cash', ar: 'فودافون كاش' },
  { key: 'instapay', code: '1030', type: 'asset', en: 'InstaPay', ar: 'إنستاباي' },
  { key: 'card_clearing', code: '1040', type: 'asset', en: 'Card clearing (gateway)', ar: 'تسوية البطاقات (بوابة الدفع)' },
  { key: 'ar', code: '1100', type: 'asset', en: 'Accounts receivable – customers', ar: 'ذمم مدينة – العملاء' },
  { key: 'prepaid_wallet', code: '1200', type: 'asset', en: 'Prepaid wallet balance', ar: 'رصيد المحفظة المدفوع مقدمًا' },
  { key: 'agency_wallet_liability', code: '2000', type: 'liability', en: 'Agency wallets (liability)', ar: 'محافظ الوكالات (التزام)' },
  { key: 'refund_payable', code: '2050', type: 'liability', en: 'Refunds payable', ar: 'مستردات مستحقة الدفع' },
  { key: 'ap_supplier', code: '2100', type: 'liability', en: 'Supplier payables', ar: 'مستحقات الموردين' },
  { key: 'tax_payable', code: '2200', type: 'liability', en: 'Tax payable', ar: 'ضرائب مستحقة' },
  { key: 'equity', code: '3000', type: 'equity', en: 'Owner equity', ar: 'حقوق الملكية' },
  { key: 'sales_revenue', code: '4000', type: 'revenue', en: 'Sales revenue', ar: 'إيرادات المبيعات' },
  { key: 'platform_markup_revenue', code: '4100', type: 'revenue', en: 'Platform markup revenue', ar: 'إيرادات هامش المنصة' },
  { key: 'commission_revenue', code: '4200', type: 'revenue', en: 'Commission revenue', ar: 'إيرادات العمولات' },
  { key: 'fee_revenue', code: '4300', type: 'revenue', en: 'Fees & cancellation revenue', ar: 'إيرادات الرسوم والإلغاء' },
  { key: 'subscription_revenue', code: '4400', type: 'revenue', en: 'SaaS subscription revenue', ar: 'إيرادات الاشتراكات' },
  { key: 'cost_of_sales', code: '5000', type: 'expense', en: 'Cost of sales', ar: 'تكلفة المبيعات' },
  { key: 'expense_general', code: '6000', type: 'expense', en: 'General expenses', ar: 'مصروفات عامة' },
  { key: 'expense_rent', code: '6100', type: 'expense', en: 'Rent', ar: 'الإيجار' },
  { key: 'expense_salaries', code: '6200', type: 'expense', en: 'Salaries', ar: 'الرواتب' },
  { key: 'expense_marketing', code: '6300', type: 'expense', en: 'Marketing', ar: 'التسويق' },
];

const FIN_DEFAULTS: { kind: Kind; key: LedgerSystemKey; name: string }[] = [
  { kind: 'cash', key: 'cash', name: 'Main cash box' },
  { kind: 'bank', key: 'bank', name: 'CIB current account' },
  { kind: 'vodafone_cash', key: 'vodafone_cash', name: 'Vodafone Cash wallet' },
  { kind: 'instapay', key: 'instapay', name: 'InstaPay' },
  { kind: 'card_gateway', key: 'card_clearing', name: 'Card gateway (Paymob)' },
];
export const KIND_KEY: Record<Kind, LedgerSystemKey> = { cash: 'cash', bank: 'bank', vodafone_cash: 'vodafone_cash', instapay: 'instapay', card_gateway: 'card_clearing' };

/** Rows a tenant ledger starts with. Shared by the seed (deterministic ids) and runtime creation (new orgs). */
export function ledgerRows(tenantId: string, currency: FinancialAccountEntity['currency'], stamp: () => { id: (p: string) => string; createdAt: string; updatedAt: string; version: number }) {
  const accounts: LedgerAccountEntity[] = CHART.map((c) => {
    const s = stamp();
    return { id: s.id('lac'), createdAt: s.createdAt, updatedAt: s.updatedAt, version: 1, tenantId, code: c.code, name: { en: c.en, ar: c.ar }, type: c.type, systemKey: c.key, active: true };
  });
  const byKey = new Map(accounts.map((a) => [a.systemKey, a.id]));
  const financial: FinancialAccountEntity[] = FIN_DEFAULTS.map((f) => {
    const s = stamp();
    return { id: s.id('fac'), createdAt: s.createdAt, updatedAt: s.updatedAt, version: 1, tenantId, kind: f.kind, name: f.name, ledgerAccountId: byKey.get(f.key)!, currency, active: true };
  });
  return { accounts, financial };
}

/** Which ledger a seller posts to: Travelta Direct is the platform's retail arm and books into the platform ledger. */
export function ledgerTenant(db: Database, orgId: string): string {
  const org = db.get('organizations', orgId);
  if (org?.isPlatformRetail) return db.find('organizations', (o) => o.type === 'platform')!.id;
  return orgId;
}

/** Lazily create a ledger for tenants created at runtime (registration, new sub-agencies). */
export function ensureLedger(ctx: RequestContext, tenantId: string): void {
  if (ctx.db.find('ledgerAccounts', (a) => a.tenantId === tenantId)) return;
  const org = ctx.db.get('organizations', tenantId);
  const now = ctx.clock.nowIso();
  const { accounts, financial } = ledgerRows(tenantId, org?.baseCurrency ?? 'EGP', () => ({ id: (p) => createId(p, ctx.clock.now()), createdAt: now, updatedAt: now, version: 1 }));
  accounts.forEach((a) => ctx.db.insert('ledgerAccounts', a));
  financial.forEach((f) => ctx.db.insert('financialAccounts', f));
}

export function systemAccount(ctx: RequestContext, tenantId: string, key: LedgerSystemKey): LedgerAccountEntity {
  ensureLedger(ctx, tenantId);
  return ctx.db.find('ledgerAccounts', (a) => a.tenantId === tenantId && a.systemKey === key)!;
}

export type Party = JournalLine['party'];
export interface PostLine { key?: LedgerSystemKey; accountId?: string; debitMinor: number; creditMinor: number; party?: Party }

/**
 * ACC-1: post one balanced, immutable entry. Zero lines are dropped; an entry that nets to nothing is skipped
 * (returns null) so rules can be written uniformly for zero-commission or zero-tax items.
 */
export function post(ctx: RequestContext, e: {
  tenantId: string; memo: string; source: JournalEntryEntity['source']; sourceId: string | null; bookingId?: string | null; date?: string;
  lines: PostLine[]; reversalOf?: string | null; currency?: JournalEntryEntity['currency'];
}): JournalEntryEntity | null {
  const lines: JournalLine[] = e.lines
    .filter((l) => l.debitMinor !== 0 || l.creditMinor !== 0)
    .map((l) => ({ accountId: l.accountId ?? systemAccount(ctx, e.tenantId, l.key!).id, debitMinor: l.debitMinor, creditMinor: l.creditMinor, party: l.party ?? null }));
  if (lines.length === 0) return null;
  try {
    assertBalanced(lines);
  } catch (err) {
    if (err instanceof UnbalancedEntryError) throw new ApiException('VALIDATION_ERROR', err.message, [{ field: 'lines', issue: 'validation.unbalanced' }]);
    throw new ApiException('VALIDATION_ERROR', (err as Error).message, [{ field: 'lines', issue: 'validation.invalid_value' }]);
  }
  for (const l of lines) {
    const acc = ctx.db.get('ledgerAccounts', l.accountId);
    if (!acc || acc.tenantId !== e.tenantId) throw new ApiException('VALIDATION_ERROR', 'Account belongs to another ledger', [{ field: 'lines', issue: 'validation.invalid_value' }]);
  }
  const date = e.date ?? ctx.clock.today();
  const now = ctx.clock.nowIso();
  const org = ctx.db.get('organizations', e.tenantId);
  const entry: JournalEntryEntity = {
    id: createId('jnl', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: e.tenantId,
    number: documentNumber('JE', date, ctx.db.nextSequence(`journal:${e.tenantId}:${date.slice(0, 4)}`)),
    date, memo: e.memo.slice(0, 300), source: e.source, sourceId: e.sourceId, bookingId: e.bookingId ?? null,
    postedByUserId: ctx.principal?.user.id ?? null, reversalOf: e.reversalOf ?? null, currency: e.currency ?? org?.baseCurrency ?? 'EGP', lines,
  };
  return ctx.db.insert('journalEntries', entry);
}

/** Corrections are reversals (ACC-1): a mirror entry referencing the original, never an edit. */
export function reverseEntry(ctx: RequestContext, entry: JournalEntryEntity, memo: string): JournalEntryEntity {
  if (entry.reversalOf) throw new ApiException('INVALID_TRANSITION', 'A reversal cannot be reversed');
  if (ctx.db.find('journalEntries', (j) => j.reversalOf === entry.id)) throw new ApiException('CONFLICT', 'This entry is already reversed');
  return post(ctx, {
    tenantId: entry.tenantId, memo, source: 'adjustment', sourceId: entry.id, bookingId: entry.bookingId, reversalOf: entry.id, currency: entry.currency,
    lines: entry.lines.map((l) => ({ accountId: l.accountId, debitMinor: l.creditMinor, creditMinor: l.debitMinor, party: l.party })),
  })!;
}

/** Balance of one ledger account from posted entries (natural sign). */
export function accountBalance(db: Database, account: LedgerAccountEntity): number {
  let dr = 0;
  let cr = 0;
  for (const e of db.filter('journalEntries', (j) => j.tenantId === account.tenantId)) {
    for (const l of e.lines) if (l.accountId === account.id) { dr += l.debitMinor; cr += l.creditMinor; }
  }
  return account.type === 'asset' || account.type === 'expense' ? dr - cr : cr - dr;
}

export function financialAccountScoped(ctx: RequestContext, tenantId: string, id: string): FinancialAccountEntity {
  const acc = ctx.db.get('financialAccounts', id);
  if (!acc || acc.tenantId !== tenantId || !acc.active) {
    throw new ApiException('VALIDATION_ERROR', 'Unknown financial account', [{ field: 'financialAccountId', issue: 'validation.invalid_value' }]);
  }
  return acc;
}

export function defaultFinancialAccount(ctx: RequestContext, tenantId: string, kind: Kind): FinancialAccountEntity {
  ensureLedger(ctx, tenantId);
  return ctx.db.find('financialAccounts', (f) => f.tenantId === tenantId && f.kind === kind && f.active)
    ?? ctx.db.find('financialAccounts', (f) => f.tenantId === tenantId && f.active)!;
}
