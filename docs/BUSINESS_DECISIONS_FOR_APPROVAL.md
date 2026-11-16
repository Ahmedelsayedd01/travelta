# Business decisions for approval

This file lists every business rule I implemented without your explicit approval. Nothing here has been changed since you asked me to stop before changing unapproved rules. The code behaves exactly as described.

Rules you already approved in writing are not listed. These include:
- the pricing hierarchy and compounding;
- VAT on the full selling price;
- installments not passing the service date;
- pay-later off by default;
- no minimum deposit;
- no Umrah wholesaler adapter.

**Format for each decision**
- **Now:** what the code does.
- **Why:** why I chose it.
- **Impact:** the business effect.
- **Options:** alternatives.
- **Recommend:** my recommendation.
- **Change needs:** whether changing it is code-only, data-only, or code plus a data migration.

"Code" means a change in the mock server or domain rules, plus tests. "Data migration" means existing records would need converting. For this prototype that is a schema-version bump with a demo reset, but it would be a real migration with production data.

The **"To approve"** list at the end summarises what I need from you.

---

## A. Wallets, credit and the sub-agency chain

### A1. How a sub-agency booking debits wallets
- **Now:** A sub-agency booking on network or API stock creates two holds per item.
  - The sub-agency's wallet pays the parent agency, at the sub-agency's buy price.
  - The parent's wallet pays the platform, at the agency buy price.
  - Holds are placed at checkout, become debits at supplier confirmation, and are released if the item is rejected or cancelled.
  - Agency-owned inventory and Travelta Direct create no wallet legs.
  - (`legsFor` in `packages/mock-server/src/services/finance/wallet.ts`.)
- **Why:** Each party settles with the party directly above it. This mirrors how money actually moves in a parent and sub-agency relationship, and lets the parent keep its own markup.
- **Impact:** The parent always sees, and funds, its sub-agencies' network bookings. Two wallet transactions per item.
- **Options:**
  1. A single debit on the parent only. The sub-agency settles with the parent off-platform.
  2. A single debit on the sub-agency directly to the platform. The parent is bypassed and earns its markup as a commission instead.
- **Recommend:** Keep the current behaviour. It's the most transparent and matches the pricing layers.
- **Change needs:** Code. Existing wallet transactions stay valid.

### A2. The parent agency's financial responsibility
- **Now:** The parent is liable to the platform for every network booking its sub-agencies make, through its own wallet leg (A1).
  - A sub-agency's wallet is *held at* the parent. The parent approves its top-ups, can freeze it, and approves over-limit holds.
  - Platform-level holds wait for platform approval only when the parent's own wallet doesn't cover them.
- **Why:** The platform's contract is with the top-level agency. Sub-agencies are the parent's customers.
- **Impact:** A sub-agency that books beyond the parent's balance blocks on the *parent's* wallet. The parent carries the credit risk of its sub-agencies.
- **Options:**
  1. The platform contracts with sub-agencies directly. This needs KYC and a wallet at platform level.
  2. Joint liability, with the platform able to debit either wallet.
- **Recommend:** Keep the current behaviour for the MVP. Revisit if you want sub-agencies to sign platform contracts.
- **Change needs:** Code, plus a data migration (wallet holder changes).

### A3. Sub-agency credit limits
- **Now:** Only the wallet *holder* can set a credit limit. For sub-agencies that is the parent; for agencies it is the platform.
  - The default limit is 0.
  - A booking beyond balance plus limit is accepted but waits as "awaiting credit approval" until the holder approves it or the wallet is topped up (first in, first out).
  - **The platform admin cannot set a sub-agency's limit** (`setCreditLimit` requires the holder).
- **Why:** The holder bears the risk (A2).
- **Impact:** This conflicts with your new requirement that the platform admin has global control over credit limits.
- **Options:**
  1. Let the platform override any limit, with the override audited.
  2. Keep the holder-only rule and give the platform read-only access.
- **Recommend:** Option 1. Add a platform override with a reason and an audit entry, but keep the parent as the default owner.
- **Change needs:** Code only.

### A4. What a hold reserves
- **Now:** Holds use the buyer's **pre-tax buy price** (`buyPrices.agencyBuyMinor` / `subAgencyBuyMinor`).
- **Why:** Tax is collected from the end customer and remitted by the seller. The wallet settles the net purchase.
- **Impact:** The wallet balance doesn't include the VAT the agency collects.
- **Options:** Hold the tax-inclusive buy price instead.
- **Recommend:** Keep it, but confirm with your accountant.
- **Change needs:** Code, plus migration of historical holds and debits.

---

## B. Subscriptions and suspension

### B1. What a suspended subscription restricts
- **Now:** When an agency subscription is suspended (trial → past due → suspended on the demo clock), every *write* by that agency's staff is refused with "read-only until paid".
  - Still allowed: viewing data, signing in and out, managing or paying the subscription, searching, previewing prices and the demo tools.
  - The rule lives in one gate (`planGate`, `services/subscriptions.ts`).
- **Why:** It's simple, predictable, and nothing is deleted.
- **Impact:** The agency can't take new bookings, collect payments, confirm, voucher or cancel until it pays.
- **Options:**
  1. Block only new sales (search, cart, checkout) and keep operations open for existing bookings.
  2. Add a grace period before read-only.
- **Recommend:** Option 1 (block new sales only). Existing customers shouldn't suffer because their agency is late paying.
- **Change needs:** Code only.

### B2. Existing bookings during suspension
- **Now:** Agency staff can open and view bookings but can't act on them (B1).
  - **Suppliers can still confirm or reject** the agency's pending items, because the gate applies only to the suspended agency's own staff.
  - Clock jobs keep running: reminders, overdue instalments, KYC expiry.
- **Why:** Suppliers and travellers shouldn't be blocked by the agency's billing problem.
- **Impact:** A confirmation can arrive that the agency can't voucher until it pays.
- **Options:** Freeze supplier actions on a suspended agency's bookings too.
- **Recommend:** Keep suppliers working, and combine with B1 option 1.
- **Change needs:** Code only.

### B3. Refunds during suspension
- **Now:**
  - The agency **cannot** request or approve cancellations, or record refunds, while suspended.
  - **Storefront customers of that agency can still cancel themselves** and receive an automatic card refund (C4), because customers aren't gated.
  - **The agency's published branded storefront stays live and keeps taking new bookings** into an agency that can't process them.
- **Why:** This wasn't a deliberate choice. It is a consequence of the gate covering staff only. **This is the decision I most need from you.**
- **Options:**
  1. Unpublish (or show "temporarily unavailable" on) a suspended agency's storefront.
  2. Keep it live but disable checkout.
  3. Keep the current behaviour.
- **Also needed:** A rule for whether the platform may process refunds on a suspended agency's behalf.
- **Recommend:**
  - Option 2: browsing allowed, checkout disabled, with a clear message.
  - Customer self-cancellation and refunds stay allowed, because consumer protection comes first.
  - The platform admin can process refunds for suspended agencies.
- **Change needs:** Code only.

### B4. Plan modules and the storefront add-on
- **Now:** The plan modules are CRM, accounting and sub-agencies. The branded storefront is a paid add-on, included in Enterprise.
  - Without the module, its screens are hidden and its operations refused.
  - Plan limits on users, sub-agencies and bookings per month are enforced when creating.
- **Why:** These match the plan comparison in the brief.
- **Impact:** These modules decide what each plan can sell.
- **Options:** Different module groupings.
- **Recommend:** Confirm the grouping and limits with sales.
- **Change needs:** Data only (plans are editable by the platform in the admin).

### B5. Plan changes
- **Now:**
  - Upgrades apply immediately, with a prorated charge.
  - Downgrades apply at the end of the period.
  - A downgrade is **refused** while current usage exceeds the target plan's limits; the reasons are shown.
- **Why:** This avoids silently removing users or sub-agencies.
- **Impact:** The agency must reduce usage before downgrading.
- **Options:** Allow the downgrade and suspend the excess users at period end.
- **Recommend:** Keep the current behaviour.
- **Change needs:** Code only.

---

## C. Cancellations, refunds, vouchers and revenue

### C1. Cancelling an item that is still pending with the supplier
- **Now:** It is free. Policy fees apply only once the supplier has confirmed.
- **Why:** Nothing has been consumed or confirmed yet.
- **Impact:** Customers can cancel quickly after booking at no cost.
- **Options:** Apply the policy from the moment of booking.
- **Recommend:** Keep it free.
- **Change needs:** Code only.

### C2. Refund amount
- **Now:** Refund = what the customer paid minus what is still owed after the cancellation (the policy fee plus the optional agency admin fee). The refund never exceeds the amount paid.
- **Why:** This gives a correct net position on partially paid bookings.
- **Impact:** On a partially paid booking the fee is taken from money already paid first.
- **Options:** None that keep the books consistent.
- **Recommend:** Keep it.
- **Change needs:** None.

### C3. Supplier and agency fees on cancellation
- **Now:**
  - The supplier keeps its policy fee, which reduces the payable.
  - An optional fixed **agency admin fee** applies per agency. The demo seeds 150 EGP for Nile Horizon and 0 for everyone else.
- **Why:** The brief asked for an optional agency fee, which I made fixed per agency.
- **Impact:** The agency fee is revenue for the agency.
- **Options:** A percentage fee, or a fee per service type.
- **Recommend:** Confirm whether you want a percentage option.
- **Change needs:** Code plus data.

### C4. Storefront customers cancelling online
- **Now:** Customers cancel without staff approval and are refunded automatically to the card they paid with. Staff refunds above their limit need approval by someone with `payments.refund_approve`.
- **Why:** This gives a self-service consumer experience.
- **Impact:** Agencies can't review customer cancellations before the refund.
- **Options:**
  1. Require agency approval of customer cancellations above an amount.
  2. Allow free-window cancellations only.
- **Recommend:** Keep self-service inside the free window, and require approval when a fee applies.
- **Change needs:** Code only.

### C5. When revenue is recognised
- **Now:** Revenue is posted when the supplier confirms. The invoice is issued at the same moment.
  - Cancellations and refunds post their own reversing entries. Nothing financial is ever deleted.
  - The platform markup is the balancing figure of each posting, so every entry balances by construction.
- **Why:** Confirmation is the point at which the sale is certain.
- **Impact:** Pending bookings show sales value but no revenue yet.
- **Options:** Recognise revenue on the service date (accrual by travel date).
- **Recommend:** Ask your accountant. Travel-date recognition is common for agencies.
- **Change needs:** Code, plus re-posting history.

### C6. When a voucher can be issued
- **Now:** Only after supplier confirmation *and* when the booking is fully paid **or** on an agreed partial or instalment plan. A "full payment" booking that hasn't been paid can't be vouchered.
- **Why:** To stop issuing travel documents before money is secured.
- **Impact:** Agents must collect before vouchering full-payment bookings.
- **Options:** Allow vouchers on credit for trusted customers.
- **Recommend:** Keep it, and add a per-customer credit flag later.
- **Change needs:** Code only.

---

## D. Access, permissions and administration

### D1. Platform admin and catalog ownership (new in this round)
- **Now:** The platform admin can create, edit, publish, pause, archive, restore and delete **any** product. Every product still belongs to a supplier or agency, which the admin chooses when creating it.
  - The owner's rules still apply: a supplier must have the service line approved, and products go live only for owners with valid KYC.
  - Every change is audited with before and after values and the acting organisation type.
- **Why:** You asked for full admin CRUD without breaking tenant ownership.
- **Impact:** Suppliers see changes made by the platform in their own product list.
- **Options:** Platform-owned products, where Travelta is the supplier of record.
- **Recommend:** Keep ownership with suppliers and agencies.
- **Change needs:** Code only.

### D2. Archive versus delete (new)
- **Now:**
  - Products can be hard-deleted only if they were never booked and nothing was sold on their calendar. Otherwise the server refuses and the admin archives the product instead.
  - Archived products leave search and can't be edited until restored.
  - Destinations can be deleted only when unused (no products or pricing rules); otherwise they are deactivated.
- **Why:** Booking history must keep pointing at real products.
- **Impact:** Some records can never disappear completely.
- **Options:** Soft-delete everything.
- **Recommend:** Keep it.
- **Change needs:** None.

### D3. Coordinate validation (new)
- **Now:** Places must be within 60 km of their destination's centre (airports within 120 km). Hotels must be within 60 km.
- **Why:** This catches swapped latitude and longitude, and wrong-city coordinates.
- **Impact:** Remote desert lodges or long-distance airports would need a new destination.
- **Options:** A per-destination radius.
- **Recommend:** Make the radius per destination when real content arrives.
- **Change needs:** Code plus data.

### D4. What another tenant's record looks like
- **Now:** Opening another tenant's record by URL or ID answers **"not found"**, never "forbidden".
- **Why:** The response doesn't confirm that the record exists.
- **Impact:** Support staff can't tell "wrong ID" from "not yours".
- **Options:** Return "forbidden" for authenticated users.
- **Recommend:** Keep "not found".
- **Change needs:** None.

### D5. Sales agents and the supplier list
- **Now:** Users with `bookings.create` can read the agency's supplier list (names only) to pick one in manual bookings and quotations. Contract terms (commission and rates) stay hidden.
- **Why:** Otherwise sales agents couldn't create manual bookings.
- **Impact:** Agents see which suppliers the agency uses.
- **Options:** A separate `suppliers.pick` permission.
- **Recommend:** Keep it.
- **Change needs:** Code only.

---

## E. Storefronts and domains

### E1. Unpublished storefronts
- **Now:** Visiting an unpublished or inactive storefront answers "not available", the same as one that doesn't exist.
- **Why:** This doesn't reveal which agencies are preparing a store.
- **Impact:** None.
- **Options:** A "coming soon" page.
- **Recommend:** Keep it.
- **Change needs:** None.

### E2. Custom domains
- **Now:** Custom domains are verified against a **simulated** DNS table, and no SSL certificate is issued. The screen says so explicitly.
  - Subdomains (`<sub>.localhost` and `.travelta.app`) are mapped by the web proxy.
  - Custom domains resolve only through the storefront lookup, not by real host routing.
- **Why:** Real DNS and SSL need backend infrastructure, which is out of scope for this phase.
- **Impact:** The demo shows the full flow, but no real domain works.
- **Options:** —
- **Recommend:** Implement with the NestJS edge (certificate automation).
- **Change needs:** Backend work.

---

## F. Accounts and authentication (new in this round)

### F1. Password reset and email codes
- **Now:**
  - Codes are 6 digits, valid for 15 minutes, and locked after 5 wrong attempts. A new request invalidates older codes.
  - A reset revokes every session and also marks the email as verified.
  - Unknown emails get the same "if an account exists…" answer.
  - **Prototype only:** the code is echoed back as `demoCode` and shown in a "Demo inbox" box so the flow is usable without email. This reveals whether an account exists and **must be removed in production**.
- **Why:** These are common security defaults, plus testability.
- **Impact:** —
- **Options:** Different lengths or expiry, or a magic link instead of a code.
- **Recommend:** Keep the rules and remove `demoCode` with the backend.
- **Change needs:** Code only.

### F2. Is email verification required?
- **Now:** No. Unverified customers can browse and book. A banner asks them to verify.
  - Seeded demo users are pre-verified, and invited staff are verified on invite.
  - New customers and new business sign-ups start unverified.
- **Why:** Requiring it would add friction during checkout.
- **Impact:** Bookings can be made with mistyped emails.
- **Options:** Require verification before the first booking, or before payment.
- **Recommend:** Require it before the first *payment*.
- **Change needs:** Code only.

### F3. Favourites
- **Now:** Favourites are per customer and private, with a maximum of 200. Prices are never stored; they are checked again when the customer searches.
  - Staff have no favourites.
  - Web and mobile share favourites through the same operations, but each app keeps its own local dataset (G2).
- **Why:** Stored prices would go stale and mislead customers.
- **Impact:** —
- **Options:** Price-drop alerts.
- **Recommend:** Keep it.
- **Change needs:** —

---

## G. Demo data and the environment

### G1. Seeded operating expenses make the 30-day profit negative
- **Now:** The calculation is correct; this was verified against journal lines (see `FINANCIAL_VERIFICATION.md`). The seeded monthly rent, salaries and marketing are much larger than the seeded sales margin.
  - Nile Horizon: gross profit EGP 3,940.62 against expenses of EGP 51,500.
- **Why:** The seed amounts were picked to exercise the expense screens, not calibrated to the sales volume.
- **Impact:** The demo dashboards look loss-making.
- **Options:**
  1. Scale the seeded expenses down.
  2. Seed more bookings.
  3. Keep it as a realistic early-stage picture.
- **Recommend:** Option 1. Data only, and the calculation doesn't change.
- **Change needs:** Data (a seed change plus a demo reset).

### G2. Web and mobile keep separate local data
- **Now:** Each app has its own dataset: IndexedDB on the web, the device on mobile. Moving a scenario between them is done by JSON export and import, which validates the schema version, every row and every key reference.
  - Nothing is synchronised in real time, and nothing claims to be.
- **Why:** There is no backend in this phase.
- **Impact:** —
- **Options:** —
- **Recommend:** Real sync arrives with the API.
- **Change needs:** —

### G3. Pay-later in the demo data
- **Now:** It is off by default for every seller (as approved), but **the demo data enables it for Travelta Direct and Nile Horizon** so the flow can be shown.
- **Why:** Demonstration only.
- **Impact:** The demo storefronts offer pay-later.
- **Options:** Turn it off in the seed.
- **Recommend:** Keep it on for the demo only.
- **Change needs:** Data only.

### G4. Map tiles and positions
- **Now:**
  - Maps use public OpenStreetMap tiles, configured through one setting (`NEXT_PUBLIC_MAP_TILE_URL` / `EXPO_PUBLIC_MAP_TILE_URL`).
  - Seeded places use approximate real coordinates.
  - Hotel positions from the mock TBO and Hotelbeds feeds are generated deterministically near the destination centre, so they are *not* real addresses.
- **Why:** No API key is needed and the setup is free.
- **Impact:** OpenStreetMap's tile usage policy doesn't allow heavy commercial use.
- **Options:** A commercial tile provider (MapTiler, Stadia, Mapbox) or self-hosted tiles.
- **Recommend:** Pick a provider before launch. It's a configuration change.
- **Change needs:** Configuration only.

---

## To approve

The most urgent items are first.

1. **B3:** what a suspended agency's storefront, refunds and the platform may do.
2. **B1 and B2:** read-only versus "block new sales only" during suspension.
3. **A3:** a platform override for sub-agency credit limits.
4. **C5:** revenue recognised at confirmation or on the travel date.
5. **F2:** whether email verification is required before the first payment.
6. **C4:** whether customer self-cancellation needs approval when a fee applies.
7. **G1:** recalibrate the seeded expenses.
8. Confirm the rest (A1, A2, A4, B4, B5, C1–C3, C6, D1–D5, E1, E2, F1, F3, G2–G4), or tell me what to change.
