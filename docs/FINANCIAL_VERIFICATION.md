# Financial dashboard verification

**Question:** the agency dashboard shows a negative 30-day profit. Is the calculation wrong, or is it the data?

**Answer:** the calculation is correct. The figure comes from the seeded operating expenses, which are large compared with the seeded sales margin. I did not change the calculation.

The check runs as an automated test: `packages/mock-server/src/finance-audit.test.ts`.
- It rebuilds the seeded demo (about 6 months of history created by the real services).
- It reads the dashboard as Nile Horizon and as the platform.
- It re-derives every figure independently from the raw journal lines in the exported dataset.

Run it with:
```
pnpm --filter @travelta/mock-server exec vitest run src/finance-audit.test.ts
```

## How profit is calculated

The window is the 30 days ending today: **17 Oct – 15 Nov 2026** on the test clock. Every figure comes from journal lines dated in that window (rule ACC-3). Nothing is estimated from bookings.

```
Revenue                      Σ (credit − debit) on revenue accounts
− Cost of sales              Σ (debit − credit) on the cost-of-sales account   (supplier cost)
= Gross profit
− Operating expenses         Σ (debit − credit) on the other expense accounts   (rent, salaries, marketing, …)
= Net profit                 = the dashboard's profit KPI
```

- **When revenue is recognised:** when the supplier confirms the booking. The invoice is issued at the same time.
- **Cancellations and refunds:** they post their own reversing entries, which lower revenue or cost in the period where they happen. Nothing is ever deleted.
- **Expenses:** they are posted on their own expense date. An expense outside the window never counts, even if it was recorded inside it.

The dashboard now shows this breakdown in a **"How profit is calculated"** card, computed on the server from the same lines.

## Nile Horizon Travel, 30 days (EGP)

| Line | Amount |
|---|---:|
| Sales revenue | 28,147.06 |
| − Cost of sales (supplier cost) | 24,206.44 |
| **= Gross profit** | **3,940.62** |
| − Rent | 12,000.00 |
| − Salaries | 32,000.00 |
| − Marketing | 7,500.00 |
| **= Net profit (the dashboard KPI)** | **−47,559.38** |
| Cash movement (cash, bank, wallet money) | −85,201.79 |

The window contains 16 journal entries, including 2 cancellation or refund entries.

## Travelta platform, 30 days (EGP)

| Line | Amount |
|---|---:|
| SaaS subscription revenue | 8,500.00 |
| Commission revenue | 5,000.44 |
| Sales revenue (Travelta Direct) | 3,482.49 |
| Platform markup revenue | 2,355.58 |
| Fees and cancellation revenue | 330.70 |
| **Revenue** | **19,669.21** |
| − Cost of sales | 2,724.00 |
| **= Gross profit** | **16,945.21** |
| − Salaries | 220,000.00 |
| − Marketing | 45,000.00 |
| **= Net profit (the dashboard KPI)** | **−248,054.79** |
| Cash movement | −202,537.00 |

## What the test asserts

These checks pass for both organisations:

1. **The KPI matches the ledger.** The dashboard KPI equals Σ revenue − Σ expense, recomputed from raw journal lines.
2. **The dashboard's own breakdown agrees.**
   - Its net profit equals the KPI.
   - Its revenue equals the recomputed revenue.
   - Cost of sales plus operating expenses equals total expense.
   - Gross profit minus operating expenses equals net profit.
   - Its cash movement equals the recomputed cash change.
3. **The books balance.**
   - Every journal entry in the window balances (debits equal credits).
   - The tenant's whole ledger has a trial balance of zero.
4. **Expense dates filter correctly.**
   - Every expense dated inside the window is posted inside it, with the same amount.
   - Every expense dated outside the window is absent from it.

Cancellations and refunds also reverse revenue through their own entries. The existing finance tests (`finance.test.ts`) cover the remaining checks:
- every wallet equals the sum of its transactions;
- refunds never exceed what is refundable;
- receivables match open invoices;
- supplier payables match the confirmed items.

## Cash versus profit

Cash moved by −85,201.79 while profit is −47,559.38. The two differ because cash moves on different dates from revenue, for example:
- customer payments collected for bookings confirmed earlier, or not yet confirmed;
- supplier payouts;
- wallet top-ups (a liability, not revenue);
- expenses paid from the bank.

The card shows the cash figure next to profit so the two are never confused.

## Conclusion and options

- **Correctness:** the calculation is correct and fully traceable to the ledger.
- **Cause of the negative figure:** the seeded data. For Nile Horizon, rent of 12,000, salaries of 32,000 and marketing of 7,500 a month far exceed a 30-day gross profit of 3,940.62.
- **Options (no change made):** see `BUSINESS_DECISIONS_FOR_APPROVAL.md` → G1.
  - Scale down the seeded expenses, or add more seeded bookings. This changes data only, not the calculation.
  - Keep it as a realistic early-stage picture.
