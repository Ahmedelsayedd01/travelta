# Travelta 2.0 prototype: final report (Stage B)

**Status:** all 25 milestones are implemented on simulated, persisted mock data. Web (Next.js, at http://localhost:3001) and mobile (Expo) share contracts, schemas, domain rules and the mock server. There is no NestJS backend, as agreed. Nothing has been committed to git yet.

## What was built

| Milestones | Scope delivered |
|---|---|
| 1–7 | Monorepo, design system (light/dark, en/ar, RTL), mock server with persistence, clock and demo tools, auth and RBAC, organisations and sub-agencies, portal shells, KYC with expiry watcher |
| 8–11 | Pricing engine with simulator, catalogue and inventory for all 7 services, supplier adapters (extranet, manual, mock TBO and Hotelbeds), merged search across sources |
| 12–13 | Server-side cart with 15-minute quotes and recheck, idempotent checkout, manual booking wizard, booking lifecycle state machine, ops board, supplier confirmation, vouchers for all 7 services |
| 14 | Payments: full, partial and later plans; split collections across financial accounts; overdue board with reminders; card authorise → capture/void; payment-plan editing |
| 15 | Wallets and credit: holds on network/API stock, capture at confirmation, top-ups with approval, credit limits, freeze, over-limit approval, sub-agency funding by the parent |
| 16 | Invoices (INV-1..3) with after-tax adjustments; credit notes; cancellation and refund flow (W7) with approval and adapter retry; double-entry ledger per tenant; trial balance and P&L; expenses; transfers; supplier payables and payouts; receivables ageing |
| 17 | CRM: leads, request pipeline (drag or menu), engine-priced quotations with revisions, send by email/WhatsApp, win → pre-filled checkout → linked booking, follow-ups, customer 360 |
| 18 | SaaS subscriptions: DEMO plans editable by the platform; trial → past due → suspended (read-only) on the demo clock; prorated upgrades; downgrades at period end; storefront add-on; plan limits and modules enforced centrally |
| 19 | Notifications: in-app bell for every role; email/WhatsApp outbox with en/ar templates; clock-driven reminders (instalments, travel, KYC expiry, follow-ups) |
| 20 | Dashboards for platform, agency and supplier; 9 reports (sales, bookings, profit from the ledger, margins per party, ageing, payables, agency/agent/supplier performance); CSV export; ~6 months of seeded history created by the real services |
| 21 | Travelta Direct storefront: live search on the home page, promo codes, card or pay-later checkout, customer account (trips, pay now, self-service cancellation, vouchers, profile, support) |
| 22 | Agency-branded storefronts: branding with WCAG contrast enforcement, publish switch, `/s/<slug>`, `<sub>.localhost` host mapping, custom domain with simulated DNS verification, bookings into the agency tenant |
| 23 | Mobile B2C app: tabs (Home, Search, Trips, Notifications, Profile), results, product, cart with promo, checkout (card incl. 3-D Secure / pay later), trip detail with pay-now and cancellation, voucher shared as PDF, local notifications, support, settings |
| 24 | Package-boundary lint for every package type; cross-app contract tests |
| 25 | Full browser regression, accessibility / dark / phone-width audit, docs |

## Verification

- **Unit and integration tests:** ~313 tests, all green. This includes dedicated financial tests:
  - every journal entry balances;
  - every wallet equals its transactions;
  - the instalment golden vector;
  - cancellation fees and refunds;
  - proration.
- **Contract tests:** 9, all green (see `TESTING_STRATEGY.md` §6).
- **Lint:** green across all 10 packages, boundary rules included. Five old warnings remain in early web screens (React Compiler / react-hook-form notices).
- **Browser:**
  - 14 journeys, 222 checks, en + ar, no console errors.
  - Quality audit: 42/42 across 21 key screens (light at 1280 px, dark at 375 px).
- **Mobile:** typecheck, lint and `expo export` for iOS and Android all pass.

## Decisions taken without asking (per the standing instruction)

- **Accounting**
  - Travelta Direct posts to the platform ledger.
  - Wallet holds use the buyer's pre-tax buy price.
  - A sub-agency booking debits two wallets: sub-agency → parent, then parent → platform.
  - The platform markup is the balancing figure, so every entry balances by construction.
- **Cancellation and refunds**
  - Cancelling a still-pending item is free.
  - Refunds return only what was paid beyond what is still owed.
  - The supplier keeps its policy fee from the payable.
  - Storefront customers cancel without approval and are refunded to their card.
- **Subscriptions**
  - Plan modules are CRM, accounting and sub-agencies. The storefront is an add-on, included in Enterprise.
  - A suspended subscription makes the agency read-only through one central gate.
  - A downgrade is refused while current usage exceeds the target plan.
- **Storefronts**
  - Unpublished storefronts return "not found", not "not eligible".
  - The web proxy maps subdomains only; custom-domain resolution is simulated through the public storefront lookup.
- **Access:** sales agents can read the supplier list as a picker (needed for manual bookings and quotations), but not contract terms.
- **Demo data:** history is generated by the real services with a seeded random source, so resets stay byte-identical. Unit tests start from the bare seed.

## Known gaps and next steps

1. **Mobile not run on a device.** There is no simulator or emulator on the build machine. Next: run `pnpm dev:mobile` on iOS and Android in both languages.
2. **Browser tests not in the repo.** They are CDP scripts outside the repo, and the accessibility audit is custom. Next: port both to a committed Playwright + axe-core suite in `apps/web/e2e`.
3. **Custom domains on a real host.** They need a host lookup at the edge, which arrives with the NestJS API.
4. **Single-node simulation.** Web and mobile keep separate local datasets, and the last writer wins between browser tabs (documented in MOCK_DATA_ARCHITECTURE).

---

# Enhancement round (16 Nov 2026)

This round started from your two follow-up briefs: the marketplace enhancement, and the gap review of this report. Details are in `PLATFORM_AUDIT.md`. Business rules waiting for your decision are in `BUSINESS_DECISIONS_FOR_APPROVAL.md`; none were changed.

## Delivered

- **Admin CRUD root causes fixed.** The causes were the server refusing platform catalog writes, the UI hiding actions from the platform, actions failing silently on server errors, and missing operations. The platform now manages products for any owner (archive / restore / delete with dependency checks), destinations and places, and agency or supplier profiles. Every change is audited with before and after values.
- **Interactive hotel maps (web).**
  - List / split / map views, with price pills linked both ways to the result cards.
  - "Search as I move the map", distance sort, and an empty-area state.
  - A hotel location panel showing nearby attractions, airports, transit and neighbourhoods, distances and directions.
  - An admin coordinate picker with server-side validation, using OpenStreetMap tiles behind a provider setting.
- **Interactive hotel maps (mobile).** The same features via Leaflet in a WebView.
- **Customer authentication.** Forgot password, a one-time-code reset (15 min expiry, 5 attempts, session revocation, no account enumeration) and email verification, on web and mobile. Delivery is simulated through the outbox.
- **Mobile.**
  - Four-screen onboarding, saved on the device.
  - Tabs: Home, Explore, Bookings, Favorites and Profile.
  - Home shows featured destinations, recent searches and top-rated recommendations.
  - Results map, hotel location card, favourites, forgot password and verification.
- **Favourites.** On the web storefront and on mobile, private to each customer.
- **Financial audit.** The 30-day profit KPI is re-derived from journal lines in an automated test. The dashboard shows a "How profit is calculated" breakdown with cash movement (`FINANCIAL_VERIFICATION.md`). The calculation was correct; the negative figure comes from the seeded expenses.
- **Demo data transfer.** JSON import now also checks referential integrity (17 key relationships, plus journal lines against same-tenant accounts).
- **Custom domains.** An explicit "DNS and SSL are not connected" notice and the tenant mapping line, on top of the existing subdomain, branding, simulated DNS and preview.
- **Committed browser tests.** Playwright + axe-core in `apps/web/e2e` (`pnpm --filter @travelta/web e2e`), replacing the scratch scripts.

## Verification (commands actually run)

| Gate | Result |
|---|---|
| Typecheck + lint (20 tasks) | Passed (5 pre-existing warnings, 0 errors) |
| Unit and integration tests | 336 passed (mock-server 178, including new admin-CRUD, maps, auth-recovery, favourites, financial-audit and import-integrity tests) |
| Web production build | Passed |
| Playwright e2e | 33 / 33 passed, desktop + Pixel 7, including axe-core WCAG 2.1 AA on 26 screens |
| Expo export, iOS + Android | Passed |
| Mobile on a device or simulator | **Not run**: no simulator or SDK on this machine. Steps and a checklist are in `MOBILE_TESTING.md` |

## Not done

These are listed in `PLATFORM_AUDIT.md` §7:
- CMS, reviews, a ticket queue, newsletter, and currency / feature administration;
- amendments with repricing and the extended booking states;
- flight round-trip and multi-city;
- visa application stages;
- the full marketing landing page;
- device testing of the mobile app.
