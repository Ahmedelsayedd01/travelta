# Business Rules

Each rule has an ID. Tests in `packages/domain` and `packages/mock-server` reference these IDs. **[P]** = stated in the proposal. **[V1]** = taken from v1 code. **[D]** = default decided here, pending your confirmation (see `RISKS_AND_OPEN_QUESTIONS.md`).

All of these rules are implemented in `@travelta/domain`. They run inside the mock server now and inside NestJS later. **Every rule here is frontend-simulated in this phase and must be authoritative on the server in production.**

---

## MON: Money
- **MON-1 [D]** Amounts are integers in minor units with an ISO currency. Arithmetic never uses floats on money.
- **MON-2 [D]** Rounding is half-up to minor units, applied **per line per layer**. Totals are sums of rounded lines.
- **MON-3 [P]** Supported currencies: EGP, USD, SAR, EUR. Each tenant has a base currency (seed: EGP).

## FX: Exchange rates
- **FX-1 [P]** The rate is **locked when the booking is created**. The booking stores `fxSnapshot { base, quote, rate, source, at }` per currency pair it used. Later rate changes never alter that booking, its invoice or its ledger entries.
- **FX-2 [D]** Search and cart prices use the current rate. A cart quote fixes the rate for its validity (QTE-1). Checkout locks it into the booking.
- **FX-3 [D]** Ledger lines record the transaction currency, the locked rate and the base-currency amount.

## PRC: Pricing engine (full specification in `PRICING_ENGINE.md`)
- **PRC-1 [Decided]** Chain: Supplier Net → Platform → Agency → Sub-Agency → Fees → Discounts → Tax → Rounding → Customer price. Each layer is `percent | fixed`.
- **PRC-2 [Decided]** Percent markups **compound**: each applies to the price produced by the previous layer.
- **PRC-3 [Decided]** Fixed markups are per unit of sale (room-night, pax, seat, vehicle, ticket) or per booking, and are converted at the locked FX rate.
- **PRC-4 [Decided]** Rules match on service, source, supplier, target agency/sub-agency, product, destination, nationality group, customer type, channel and validity windows. The most specific rule wins (weighted score in `PRICING_ENGINE.md §4`). Agencies configure their own rules independently.
- **PRC-5 [Decided]** The platform markup applies to TBO, Hotelbeds and **network suppliers** (registered on Travelta). It **never** applies to an agency's own inventory (own extranet or own manual suppliers).
- **PRC-6 [Decided]** Travelta Direct (platform B2C) uses the platform's retail seller org as its agency layer. An agency storefront uses that agency's B2C rules.
- **PRC-7 [P][V1]** Tax per room or service, inclusive or exclusive. Golden test: 2×110 EGP @5% + 5×125 EGP @0% = **856 EGP**.
- **PRC-8 [Decided]** Every quote, cart item and booking item stores a complete `PriceBreakdown` (lines, rule ids and versions, FX snapshot, settlement, margins). It becomes immutable at confirmation.
- **PRC-9 [Decided]** Overrides (markup, final price, discount, guardrail break) are permission-gated, need a reason and are audited.
- **PRC-10 [Decided]** **Supplier commission is separate from markup.** It never changes the customer price. It's deducted from the supplier payout and credited to the contract owner (platform for network suppliers).
- **PRC-11 [Decided]** Min/max limits per rule, plus guardrails from the tier above. Margin floor: the pre-tax sell is never below the seller's buy price.
- **PRC-12 [Decided]** Rounding: half-up in minor units per layer, plus optional seller-level final rounding. The difference is recorded on a `roundingAdj` revenue line.
- **PRC-13 [Decided]** Every commercial value (default markups, commissions, guardrails, FX buffer, plan prices, credit limits) lives in **Commercial Settings / rules data**, editable in the admin UI, and is flagged `isDemoValue`. Business logic contains no hardcoded commercial numbers.
- **PRC-14** Rules are versioned. Pricing computations and changes are logged (pricing history + audit log).

## QTE: Quotes and rechecks
- **QTE-1 [P]** The adapter flow is `search → recheck → book → cancel`. Adding to the cart creates a `PriceQuote` that expires after **15 minutes [D]**.
- **QTE-2 [P]** Checkout rechecks every item. If the price changed, the user sees old vs new and must accept. If the item is unavailable, it's removed with a message.

## BKG: Booking lifecycle
Item states: `pending → confirmed → vouchered → travelled`, with exits `pending → rejected` (supplier declined or failed), `pending → cancelled`, `confirmed|vouchered → cancelled` (before travel), and `vouchered → no_show` (v1 "missed").

- **BKG-1 [P]** Transitions are enforced by a state machine. Anything else raises `INVALID_TRANSITION`. Each transition logs `{from, to, actor, reason, at}`.
- **BKG-2 [D]** Booking status is derived from its items:
  - all rejected/cancelled → `cancelled`
  - any pending → `pending` (flagged "partially confirmed" when some items are confirmed)
  - all remaining confirmed or higher → the lowest common state.
- **BKG-3 [P]** **Stock is held and money is counted only at confirmation.** At confirmation the system:
  - decrements allotment/seats (fails → `rejected` with `SOLD_OUT`)
  - stores the supplier reference
  - issues the invoice (INV-1)
  - posts the ledger entries (ACC)
  - captures the wallet hold or card authorisation
  - creates the supplier payable.
- **BKG-4 [D]** A pending item can carry a **hold reason**: `awaiting_supplier | awaiting_payment | awaiting_credit_approval`.
- **BKG-5 [P]** Operations can't change prices after confirmation. A change means cancel and rebook, or a separately invoiced amendment fee **[D]**.
- **BKG-6 [D]** A voucher can be issued only for a `confirmed` item that has a supplier reference **and** whose booking is fully paid or has an approved payment plan.
- **BKG-7 [D]** `travelled` is set automatically once the service end date has passed (the demo clock drives this). Ops can mark `no_show`.
- **BKG-8 [V1]** The booking reference format is `TRV-YYMM-XXXXX` and it's searchable from the global lookup. Each item also keeps the supplier's confirmation number.
- **BKG-9 [D]** Supplier confirmation SLA: manual-supplier items still pending 24 h after creation show as "Overdue confirmation" on the ops board.

## CAN: Cancellation and refund
- **CAN-1 [P]** The fee comes from the item's **policy snapshot**, taken at booking: the rule matching `daysBeforeService` gives a fee as a percent, a fixed amount or N nights. Non-refundable means 100%.
- **CAN-2 [D]** Customer fee = the policy applied to the **sell** price. Supplier fee = the policy applied to the **net**. An optional agency admin fee comes from tenant settings.
- **CAN-3 [P]** Refund = amount paid − customer fee, floored at 0. A credit note (refund invoice) is issued for the cancelled value minus fees. Any unpaid part of the fee stays as a receivable **[D]**.
- **CAN-4 [D]** Refunds by sales agents need approval from a role with `payments.refund_approve`. B2B refunds go back to the wallet. B2C refunds go back to the original method (simulated).
- **CAN-5 [D]** API-sourced items are cancelled through the adapter `cancel()`. A simulated supplier failure leaves the cancellation `requested` with a retry action.

## PAY: Payments and instalments
- **PAY-1 [P][V1]** Payment types are `full | partial | later`. Partial creates an instalment plan.
- **PAY-2 [P]** Instalments must sum **exactly** to the booking total. Each has an amount > 0 and a due date. Due dates are strictly increasing, and **[D]** none is later than the service start date. Golden test: 770 = 70 (today) + 600 + 100.
- **PAY-3 [P]** One collection can be split across financial accounts (cash, bank, Vodafone Cash, card, InstaPay). The allocations sum to the payment amount.
- **PAY-4 [D]** A collection pays the oldest open instalment first unless the user chooses one. Overpayment is refused, except as an explicit customer credit.
- **PAY-5 [P]** An unpaid instalment whose due date is before today is `overdue` and appears on the Overdue board. Reminders are sent 3 days before **[D]** and on the due date (simulated notification).
- **PAY-6 [D]** B2C storefront card payments are *authorised* at checkout and *captured* at confirmation. A rejected item voids the authorisation for that amount. "Pay later" on the storefront is available only when tenant settings enable it.
- **PAY-7 [P]** Gateways (simulated): Paymob for EGP, Stripe/PayPal otherwise. Test cards are listed in `MOCK_DATA_ARCHITECTURE.md`.

## WAL: Wallet and credit (B2B)
- **WAL-1 [P]** Agencies (with the platform) and sub-agencies (with their parent) have a prepaid wallet plus an optional credit limit.
- **WAL-2 [D]** `available = balance + creditLimit − activeHolds`. The balance can go negative down to −creditLimit. Credit used = max(0, −balance).
- **WAL-3 [V1][D]** A B2B booking places a **hold** (v1 `reserved_fund`) for the buyer's cost. Confirmation captures the hold as a debit. Rejection or cancellation releases it.
- **WAL-4 [P]** If the cost is more than what's available, the booking stays `pending (awaiting_credit_approval)`. It moves on when a top-up is approved, or when compliance/ops (platform) or the parent-agency owner approves an over-limit exception.
- **WAL-5 [V1]** Top-up requests (method plus proof file) are `pending → approved | rejected`. Approval credits the wallet and posts ledger entries. Top-ups repay used credit first, automatically.
- **WAL-6** Wallet balance is **derived from wallet transactions**. The cached balance is checked against the sum in tests.

## INV: Invoices
- **INV-1 [P]** The invoice is issued at confirmation, numbered per tenant (`INV-2026-000123`).
- **INV-2 [P][V1]** Invoices can carry a discount, extra fees and notes. **[D]** These are adjustments **after tax** on the invoice total, as in v1. Invoice total = Σ item sell − discount + extra fees.
- **INV-3** Invoice status follows payments: `issued → partially_paid → paid`. It's `void` only if every item is cancelled before any payment; otherwise a credit note is issued.

## ACC: Double-entry accounting (per tenant ledger)
- **ACC-1 [P]** Every money event posts a balanced journal entry (Σ debits = Σ credits). Entries are immutable. Corrections are reversals.
- **ACC-2** Posting rules use the item's finalized `PriceBreakdown.settlement`. Supplier Payable is posted at **payout (net − commission)** and the commission is posted to Commission Revenue of its beneficiary. Posting rules (simplified; system accounts are seeded per tenant):

| Event | Ledger | Debit | Credit |
|---|---|---|---|
| Agency wallet top-up approved | Platform | Bank / Financial account | Agency Wallet Liability |
|  | Agency | Prepaid Wallet (asset) | Bank / Financial account |
| B2B booking confirmed (API or network stock) | Platform | Agency Wallet Liability (agency cost) | Supplier Payable (net − commission); Platform Markup Revenue; Commission Revenue |
|  | Agency | Cost of Sales (agency cost) | Prepaid Wallet |
|  | Agency | Accounts Receivable – customer (sell) | Sales Revenue (pre-tax); Tax Payable |
| Agency own manual-supplier booking confirmed | Agency | Cost of Sales (net) | Supplier Payable |
|  | Agency | AR – customer | Sales Revenue; Tax Payable |
| B2C platform-storefront booking confirmed | Platform | Card Clearing (captured) | Sales Revenue; Tax Payable |
|  | Platform | Cost of Sales (net) | Supplier Payable |
| Customer collection (split) | Seller | Each Financial Account (allocation) | AR – customer |
| Supplier payment | Payer | Supplier Payable | Financial Account |
| Cancellation with fee | Seller | Sales Revenue (cancelled value − fee); Tax Payable (reversed) | AR / Refund Payable / Wallet Liability |
|  | Seller | Supplier Payable (net − supplier fee) | Cost of Sales |
| Expense | Tenant | Expense category | Financial Account |
| Transfer between accounts | Tenant | To account | From account |

- **ACC-3** Reports read from the ledger: trial balance, P&L, receivables ageing (0–30/31–60/61–90/90+), supplier payables, profit per booking. Profit is **computed from posted entries, not estimated** [P].

## KYC: Onboarding and compliance
- **KYC-1 [P]** Agencies **and** suppliers must provide a Commercial Register, Tax Card and Tourism License, each with a number, issue date, expiry date and file.
- **KYC-2 [D]** Validation: expiry > issue; expiry in the future at submission; file is PDF/JPG/PNG ≤ 5 MB in the prototype.
- **KYC-3 [P]** Flow: `draft → submitted → in_review → approved | rejected | changes_requested → (resubmit) submitted`. Each decision logs the admin, the time and a reason (a reason is required for reject and request-changes).
- **KYC-4 [P]** No booking or selling until the account is approved.
- **KYC-5 [P]** Warnings go out **30 days** before any document expires (dashboard banner plus notification). On expiry the org becomes `blocked_expired_docs` and new bookings are blocked. Existing bookings carry on. Uploading a valid replacement and getting it re-approved restores `active`.
- **KYC-6 [P]** Suppliers pick their service lines. Stock in a line goes live only after a **second approval** of that line. **[D]** Products inside an approved line go live without further approval.

## CRM: Requests and leads
- **CRM-1 [V1][P]** Request stages: `pending → price_quotation → negotiation → won | lost`. Negotiation can go back to price_quotation. `lost` requires a reason.
- **CRM-2 [P]** `won` creates a booking from the request (pre-filled manual-booking wizard) and links it.
- **CRM-3 [V1]** A lead becomes a customer on its first booking (v1 sets `leads.role = user`).
- **CRM-4 [D]** Sales agents see their own leads and requests; owners and managers see everyone's. Follow-ups that are overdue appear on the agent dashboard.

## SUB: SaaS subscriptions
- **SUB-1 [P][Decided]** Plans are limited by users, modules and the storefront add-on. Plan prices and limits are editable by the platform and seeded as **DEMO values**.
- **SUB-2 [D]** Statuses: `trialing (14 d) → active → past_due → (7-day grace) → suspended | cancelled`. When suspended, bookings and new users are blocked and data is read-only.
- **SUB-3 [D]** Limits are enforced on create: adding a user over the limit returns `PLAN_LIMIT_REACHED` with an upgrade prompt.
- **SUB-4 [D]** Upgrades take effect immediately with simulated proration. Downgrades take effect at the period end.

## SUP: Suppliers
- **SUP-1 [P]** Suppliers see net rates and their own items only. They confirm or reject pending items and enter the confirmation number.
- **SUP-2 [P][Decided]** Supplier commission is configured per supplier contract (per service, optionally per product) and deducted from the payable. It is never part of the customer price (PRC-10).
- **SUP-3 [D]** Payable due date comes from the contract (seed: 7 days after service end). Overdue payables are highlighted.

## INVT: Inventory
- **INVT-1 [V1]** Hotel rate by date has allotment, sold, stop-sell and min stay. A rate can vary by nationality group.
- **INVT-2** Availability = allotment − sold > 0 for **every night** of the stay, no stop-sell, and min stay satisfied. Occupancy must fit the room type's maximums.
- **INVT-3** Tours, activities, transfers and Umrah use seats or capacity per departure or slot.
- **INVT-4 [P]** Search merges results for the same hotel across sources through mapping and shows the **cheapest** sell rate, with "+N more offers".
