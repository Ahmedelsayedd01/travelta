import { documentNumber } from '@travelta/domain';
import type {
  ExpenseEntity, FinancialAccountEntity, JournalEntryEntity, LedgerAccountEntity, LedgerSystemKey, MembershipEntity, OrganizationEntity, TopUpRequestEntity, TransferEntity, UserEntity, WalletEntity, WalletTransactionEntity,
} from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import { ledgerRows } from '../services/finance/ledger';
import type { SeedContext } from './context';

/** Opening wallet funding per agency (MOCK_DATA_ARCHITECTURE §4) — DEMO values in EGP. */
const WALLETS: Record<string, { topUps: number[]; credit: number }> = {
  nile: { topUps: [100_000, 50_000], credit: 100_000 },
  alnoor: { topUps: [60_000], credit: 25_000 },
  delta: { topUps: [20_000], credit: 10_000 },
  sunrise: { topUps: [15_000], credit: 0 },
  redsea: { topUps: [], credit: 0 },
};
const CAPITAL: Record<string, number> = { platform: 2_000_000, nile: 400_000, alnoor: 200_000, delta: 60_000, sunrise: 50_000, redsea: 50_000 };
const EXPENSES: [org: string, category: ExpenseEntity['category'], description: string, amount: number, daysAgo: number][] = [
  ['nile', 'rent', 'Office rent — Zamalek branch', 12_000, 20],
  ['nile', 'salaries', 'Staff salaries', 32_000, 15],
  ['nile', 'marketing', 'Facebook & Instagram ads', 7_500, 9],
  ['alnoor', 'rent', 'Office rent — Smouha', 9_000, 18],
  ['platform', 'salaries', 'Platform team salaries', 220_000, 15],
  ['platform', 'marketing', 'Travelta Direct launch campaign', 45_000, 6],
];

export function seedFinance(s: SeedContext, organizations: OrganizationEntity[], orgIds: Record<string, string>, users: UserEntity[], memberships: MembershipEntity[]) {
  const ledgerAccounts: LedgerAccountEntity[] = [];
  const financialAccounts: FinancialAccountEntity[] = [];
  const journalEntries: JournalEntryEntity[] = [];
  const wallets: WalletEntity[] = [];
  const walletTransactions: WalletTransactionEntity[] = [];
  const topUpRequests: TopUpRequestEntity[] = [];
  const expenses: ExpenseEntity[] = [];
  const sequences: Record<string, number> = {};
  const year = s.today.slice(0, 4);
  const stamp = () => ({ id: s.id as (p: string) => string, ...s.stamp() });

  // A ledger per accounting tenant: the platform (also books Travelta Direct) and every non-retail agency.
  for (const org of organizations.filter((o) => o.type === 'platform' || (o.type === 'agency' && !o.isPlatformRetail))) {
    const rows = ledgerRows(org.id, org.baseCurrency, stamp);
    ledgerAccounts.push(...rows.accounts);
    financialAccounts.push(...rows.financial);
  }
  const acc = (tenantId: string, key: LedgerSystemKey) => ledgerAccounts.find((a) => a.tenantId === tenantId && a.systemKey === key)!.id;
  const fin = (tenantId: string, kind: FinancialAccountEntity['kind']) => financialAccounts.find((f) => f.tenantId === tenantId && f.kind === kind)!;
  const entry = (tenantId: string, date: string, memo: string, source: JournalEntryEntity['source'], sourceId: string | null, lines: [string, number, number][]): JournalEntryEntity => {
    const key = `journal:${tenantId}:${year}`;
    sequences[key] = (sequences[key] ?? 0) + 1;
    const e: JournalEntryEntity = {
      id: s.id('jnl'), ...s.stamp(), tenantId, number: documentNumber('JE', date, sequences[key]), date, memo, source, sourceId, bookingId: null, postedByUserId: null, reversalOf: null, currency: 'EGP',
      lines: lines.map(([accountId, debitMinor, creditMinor]) => ({ accountId, debitMinor, creditMinor, party: null })),
    };
    journalEntries.push(e);
    return e;
  };
  const opening = addDays(s.today, -45);
  for (const [key, amount] of Object.entries(CAPITAL)) {
    const t = orgIds[key]!;
    entry(t, opening, 'Opening balance — owner capital', 'adjustment', null, [[acc(t, 'bank'), amount * 100, 0], [acc(t, 'equity'), 0, amount * 100]]);
  }

  // Petty cash: each ledger moves part of its capital from the bank into the cash box (a recorded transfer).
  const transfers: TransferEntity[] = [];
  for (const key of Object.keys(CAPITAL)) {
    const t = orgIds[key]!;
    const amount = key === 'platform' ? 50_000_00 : 20_000_00;
    const id = s.id('trf');
    const date = addDays(opening, 1);
    const e = entry(t, date, 'Transfer CIB current account → Main cash box · petty cash', 'transfer', id, [[fin(t, 'cash').ledgerAccountId, amount, 0], [fin(t, 'bank').ledgerAccountId, 0, amount]]);
    transfers.push({ id, ...s.stamp(), tenantId: t, fromAccountId: fin(t, 'bank').id, toAccountId: fin(t, 'cash').id, amountMinor: amount, currency: 'EGP', date, note: 'Petty cash', journalEntryId: e.id, recordedByUserId: memberships.find((m) => m.tenantId === t)?.userId ?? users[0]!.id });
  }

  const platform = orgIds.platform!;
  const ownerOf = (orgId: string) => memberships.find((m) => m.tenantId === orgId)?.userId ?? users[0]!.id;
  for (const [key, w] of Object.entries(WALLETS)) {
    const org = organizations.find((o) => o.id === orgIds[key])!;
    const holder = org.parentId ?? platform;
    const wallet: WalletEntity = { id: s.id('wal'), ...s.stamp(), tenantId: org.id, heldAtOrgId: holder, currency: 'EGP', balanceMinor: 0, creditLimitMinor: w.credit * 100, status: 'active' };
    let balance = 0;
    w.topUps.forEach((amount, i) => {
      const date = addDays(s.today, -40 + i * 12);
      const at = `${date}T09:00:00.000Z`;
      const req: TopUpRequestEntity = {
        id: s.id('tup'), ...s.stamp(), tenantId: org.id, walletId: wallet.id, amountMinor: amount * 100, method: 'bank_transfer', reference: `TRF-${date.replaceAll('-', '')}-${i + 1}`,
        proof: null, status: 'approved', requestedByUserId: ownerOf(org.id), decidedByUserId: null, decidedAt: at, reason: null,
      };
      topUpRequests.push(req);
      balance += amount * 100;
      walletTransactions.push({ id: s.id('wtx'), ...s.stamp(), tenantId: org.id, walletId: wallet.id, type: 'top_up', amountMinor: amount * 100, balanceAfterMinor: balance, bookingId: null, note: `Top-up ${req.reference} (bank_transfer)`, at, actorUserId: null });
      entry(holder, date, `Wallet top-up · ${org.name.en} · ${req.reference}`, 'top_up', req.id, [[fin(holder, 'bank').ledgerAccountId, amount * 100, 0], [acc(holder, 'agency_wallet_liability'), 0, amount * 100]]);
      entry(org.id, date, `Wallet top-up · ${req.reference}`, 'top_up', req.id, [[acc(org.id, 'prepaid_wallet'), amount * 100, 0], [fin(org.id, 'bank').ledgerAccountId, 0, amount * 100]]);
    });
    wallets.push({ ...wallet, balanceMinor: balance });
  }
  // Pending requests so the approval queues are not empty on a fresh dataset.
  for (const [key, amount, method] of [['nile', 50_000, 'instapay'], ['delta', 10_000, 'cash']] as const) {
    const w = wallets.find((x) => x.tenantId === orgIds[key])!;
    topUpRequests.push({
      id: s.id('tup'), ...s.stamp(), tenantId: w.tenantId, walletId: w.id, amountMinor: amount * 100, method, reference: `${method.toUpperCase()}-${s.today.replaceAll('-', '')}`,
      proof: null, status: 'pending', requestedByUserId: ownerOf(w.tenantId), decidedByUserId: null, decidedAt: null, reason: null,
    });
  }

  const expenseKey: Record<ExpenseEntity['category'], LedgerSystemKey> = { general: 'expense_general', rent: 'expense_rent', salaries: 'expense_salaries', marketing: 'expense_marketing' };
  for (const [key, category, description, amount, daysAgo] of EXPENSES) {
    const t = orgIds[key]!;
    const date = addDays(s.today, -daysAgo);
    const source = fin(t, 'bank');
    const id = s.id('exp');
    const e = entry(t, date, `Expense · ${description}`, 'expense', id, [[acc(t, expenseKey[category]), amount * 100, 0], [source.ledgerAccountId, 0, amount * 100]]);
    expenses.push({ id, ...s.stamp(), tenantId: t, category, description, amountMinor: amount * 100, currency: 'EGP', financialAccountId: source.id, date, journalEntryId: e.id, recordedByUserId: ownerOf(t) });
  }
  return { ledgerAccounts, financialAccounts, journalEntries, wallets, walletTransactions, topUpRequests, expenses, transfers, sequences };
}
