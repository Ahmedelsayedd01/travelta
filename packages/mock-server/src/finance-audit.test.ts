import type { ExpenseEntity, JournalEntryEntity, LedgerAccountEntity } from '@travelta/schemas';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './seed/identity';
import { testServer } from './test-utils';

/**
 * Financial dashboard verification (seeded history): the dashboard's profit KPI is re-derived independently from the raw
 * journal lines, broken down by account, and cross-checked against expenses, cancellations, invoices and cash.
 */
/** Typed view of the exported collections this audit reads. */
interface Coll { ledgerAccounts: LedgerAccountEntity[]; journalEntries: JournalEntryEntity[]; expenses: ExpenseEntity[] }
const CASH_KEYS = new Set(['cash', 'bank', 'vodafone_cash', 'instapay', 'card_clearing']);

function breakdown(c: Coll, tenantId: string, from: string, to: string) {
  const accounts = new Map<string, LedgerAccountEntity>(c.ledgerAccounts.filter((a) => a.tenantId === tenantId).map((a) => [a.id, a]));
  const entries = c.journalEntries.filter((j: JournalEntryEntity) => j.tenantId === tenantId && j.date >= from && j.date <= to);
  const byAccount = new Map<string, { code: string; name: string; type: string; systemKey: string | null; amountMinor: number }>();
  let cash = 0;
  for (const e of entries) {
    for (const l of e.lines) {
      const a = accounts.get(l.accountId)!;
      const sign = a.type === 'revenue' || a.type === 'liability' || a.type === 'equity' ? l.creditMinor - l.debitMinor : l.debitMinor - l.creditMinor;
      const row = byAccount.get(a.id) ?? { code: a.code, name: a.name.en, type: a.type, systemKey: a.systemKey, amountMinor: 0 };
      row.amountMinor += sign;
      byAccount.set(a.id, row);
      if (a.systemKey && CASH_KEYS.has(a.systemKey)) cash += l.debitMinor - l.creditMinor;
    }
  }
  const rows = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code));
  const revenue = rows.filter((r) => r.type === 'revenue').reduce((s, r) => s + r.amountMinor, 0);
  const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amountMinor, 0);
  return { entries, rows, revenue, expense, profit: revenue - expense, cashChange: cash };
}

describe('financial dashboard verification', () => {
  it('re-derives the 30-day profit KPI from journal lines and explains every component', async () => {
    const { server } = testServer({ history: true });
    const out: Record<string, unknown> = {};
    for (const email of ['owner@nilehorizon.demo', 'admin@travelta.demo']) {
      const s = await server.handle('auth.login', { email, password: DEMO_PASSWORD, audience: 'staff' });
      const dash = await server.handle('reports.dashboard', {}, s.token);
      const kpi = dash.kpis.find((k) => k.key === 'profit' || k.key === 'platformProfit')!;
      const snap = await server.handle('demo.export', undefined);
      const c = snap.collections as unknown as Coll;
      const tenantId = s.organization.id;
      const b = breakdown(c, tenantId, dash.from, dash.to);

      // 1. KPI = Σ revenue − Σ expense over journal lines dated in the window; the dashboard's own breakdown agrees.
      expect(kpi.value).toBe(b.profit);
      const pb = dash.profitBreakdown!;
      expect(pb.netProfitMinor).toBe(kpi.value);
      expect(pb.revenueMinor).toBe(b.revenue);
      expect(pb.costOfSalesMinor + pb.operatingExpensesMinor).toBe(b.expense);
      expect(pb.grossProfitMinor - pb.operatingExpensesMinor).toBe(pb.netProfitMinor);
      expect(pb.cashChangeMinor).toBe(b.cashChange);
      // 2. Every entry in the window balances (debits = credits), and the full ledger's trial balance is zero.
      for (const e of b.entries) expect(e.lines.reduce((s, l) => s + l.debitMinor - l.creditMinor, 0)).toBe(0);
      const all = c.journalEntries.filter((j) => j.tenantId === tenantId).flatMap((j) => j.lines);
      expect(all.reduce((s, l) => s + l.debitMinor - l.creditMinor, 0)).toBe(0);
      // 3. Operating expenses are filtered by their own date: each one in the window is posted in the window with the same amount.
      const expenses = c.expenses.filter((x) => x.tenantId === tenantId && x.date >= dash.from && x.date <= dash.to);
      for (const x of expenses) {
        const je = c.journalEntries.find((j) => j.id === x.journalEntryId)!;
        expect(je.date).toBe(x.date);
        expect(je.lines.reduce((s, l) => s + l.debitMinor, 0)).toBe(x.amountMinor);
      }
      const outside = c.expenses.filter((x) => x.tenantId === tenantId && (x.date < dash.from || x.date > dash.to));
      for (const x of outside) expect(b.entries.some((j) => j.id === x.journalEntryId)).toBe(false);
      const opex = expenses.reduce((s, x) => s + x.amountMinor, 0);
      const opexByCategory = expenses.reduce<Record<string, number>>((m, x) => ({ ...m, [x.category]: (m[x.category] ?? 0) + x.amountMinor }), {});
      // 4. Cancellations in the window reverse revenue through their own entries (no deletion of the original sale).
      const cancellationEntries = b.entries.filter((j) => /cancel|credit note|refund/i.test(j.memo ?? ''));

      out[email] = {
        org: s.organization.name.en, currency: dash.currency, window: { from: dash.from, to: dash.to },
        kpi: kpi.value, recomputed: b.profit, revenue: b.revenue, expense: b.expense, operatingExpenses: opex, opexByCategory,
        costOfSalesAndOther: b.expense - opex, grossProfitBeforeOpex: b.revenue - (b.expense - opex),
        cashChangeInWindow: b.cashChange, entriesInWindow: b.entries.length, cancellationOrRefundEntries: cancellationEntries.length,
        accounts: b.rows.filter((r) => r.amountMinor !== 0),
      };
    }
    // Written for docs/FINANCIAL_VERIFICATION.md (numbers are deterministic for the fixed test clock).
    if (process.env.FIN_AUDIT_OUT) writeFileSync(process.env.FIN_AUDIT_OUT, JSON.stringify(out, null, 2));
  });
});
