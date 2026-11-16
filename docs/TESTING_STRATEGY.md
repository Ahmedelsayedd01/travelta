# Testing Strategy

## 1. Pyramid
| Layer | Tool | Scope | Target |
|---|---|---|---|
| Domain unit | Vitest | Pricing, FX, tax, state machines, instalments, cancellation fees, ledger posting, permissions, KYC rules | ~100% branch coverage on `@travelta/domain` |
| Property tests | Vitest + fast-check | Random operation sequences: trial balance stays balanced; wallet balance = Σ transactions; Σ instalments = total; no illegal state reachable | Run in CI |
| Mock-server service | Vitest (in-memory persistence, latency 0, fixed clock) | Each workflow end-to-end at the service level, tenant isolation, redaction per audience, idempotency, transaction rollback | Every rule ID in `BUSINESS_RULES.md` has ≥1 test referencing it |
| Contract | Vitest | Every api-client operation's input/output validated against Zod; endpoint catalogue complete | 100% of operations |
| Web component | Vitest + Testing Library | Forms (validation messages, RTL), DataTable, PermissionGate, price breakdown rendering per audience | Key components |
| Web E2E | Playwright (Chromium + WebKit, desktop + mobile viewport, en + ar) | Golden journeys below | All green before each checkpoint |
| Mobile | jest-expo + RNTL; manual run on iOS sim + Android emu | Screens, navigation, forms, RTL | Key flows |
| Accessibility | axe (Playwright) | Portals and storefront pages | No serious or critical violations |

## 2. Golden test vectors
- **PRC-7**: 2×110 EGP @5% + 5×125 EGP @0% → **856 EGP** (231 + 625).
- **PAY-2**: total 770 → plan 70 (today) + 600 + 100 is valid. 70 + 600 + 99 is rejected (`VALIDATION_ERROR`, sum mismatch).
- **PRC-2 stacking**: net 1,000 USD, platform 8%, agency 10%, sub-agent fixed 20, tax 14% exclusive → 1,080 → 1,188 → 1,208 → tax 169.12 → **1,377.12 USD**.
- **FX-1**: book at 1 USD = 48.50 EGP, change the rate to 50.00 → booking, invoice and ledger unchanged. A new quote uses 50.00.
- **Pricing engine**: the full matrix in `PRICING_ENGINE.md §11`. Platform layer skipped for agency-own stock; commission doesn't change the customer price; waterfall property test (customer total = Σ settlement parts); guardrail clamping; margin floor; rounding adjustment; rule versions on old bookings.
- **Commission settlement**: network hotel net 1,000 EGP, commission 10%, platform 5%, agency 12% → customer pre-tax 1,176; supplier payout 900; platform revenue 50 + 100 = 150; agency revenue 126. Ledger and supplier payable match.
- **Multi-currency**: supplier net in USD, sale in EGP, partial payment in EGP, cancellation after a rate change → refund and ledger use the locked rate. Trial balance stays at 0.
- **PRC-4 specificity**: a product rule beats a destination rule, which beats a nationality-group rule, which beats a customer-group rule, which beats the default.
- **WAL-4**: available 5,000, cost 6,000 → booking `pending/awaiting_credit_approval`. Top-up 2,000 approved → proceeds automatically.
- **CAN-1**: policy "≥14 days free, 7–13 days 50%, <7 days 100%" at 10 days before, sell 2,000, paid 2,000 → fee 1,000, refund 1,000, credit note 1,000.
- **KYC-5**: move the demo clock to expiry −29 days → warning. Expiry +1 day → checkout returns `ORG_NOT_ELIGIBLE`.

## 3. E2E golden journeys (Playwright)
1. Agency owner signs up → uploads documents → compliance requests changes → resubmit → approve → agency can book.
2. Sales agent: lead → request → quotation → won → booking wizard pre-filled → wallet checkout → supplier (portal) confirms → ops issues voucher.
3. Sub-agent searches the same hotel → sees the B2B buy price, never the agency cost → books from own wallet.
4. B2C guest: search hotel + activity → cart → register → card 4242 → confirmation → voucher download → cancel within policy → refund shown.
5. Price change on recheck → user must accept the new price.
6. Accountant: partial payment plan → split collection (cash + Vodafone Cash) → demo clock → overdue board → collect → invoice paid → trial balance balanced.
7. Supplier: set availability (bulk) → stop-sell date → search no longer shows the date → reject a pending reservation → agency sees rejection and hold released.
8. Platform: change the platform markup rule → new searches reflect it, existing bookings unchanged.
9. Subscription: exceed the user limit → `PLAN_LIMIT_REACHED` → upgrade → invite succeeds.
10. Role switching: every demo role sees only its nav. A deep link to a forbidden page redirects.
11. Branded storefront: Nile Horizon storefront shows its logo and colours, uses agency B2C pricing, and the booking appears in Nile Horizon's portal, invoices and ledger (not Travelta Direct's).
12. Every service (7 journeys): search → details → book → confirm → document → cancel → refund, for hotels, flights, tours, visas, Umrah, activities and transfers.
13. Demo export → reset → import → state identical to the export.
14. Language: complete journey 4 in Arabic. Layout mirrored, numbers and dates localised, no untranslated keys (a missing-key detector fails the test).
15. Reset demo data → state identical to the seed (hash compare).

## 4. Per-milestone gate
`pnpm check` (typecheck + lint + unit) ✓ · the relevant Playwright journeys ✓ · manual click-through en/ar at 375/768/1280 px ✓ · persistence across reload ✓ · reset ✓ · docs updated ✓. **A workflow isn't reported complete unless its rule tests and journey pass.**

## 5. Test data
Tests use `buildSeed({ seed: 42, clock: '2026-06-01' })` for determinism. Each E2E test resets through `api.demo.reset()` in `beforeEach`.

## 6. Prototype status (end of Stage B)
| Layer | What runs | Result |
|---|---|---|
| Unit & integration (`pnpm check`) | domain rules (56), mock-server flows (165, incl. finance, CRM, subscriptions, notifications, storefronts, seeded history), schemas, i18n parity, design-token contrast, shared utils | all green |
| Contract tests (`mock-server/src/contracts.test.ts`) | catalogue ⇄ handlers, unique HTTP routes, public-operation allow-list, every `api.call` in web & mobile exists, demo-only ops confined to demo tools, apps never import the server or each other, every error code / validation key / notification topic translated in en + ar | all green |
| Boundary lint | `no-restricted-imports` per package type (pure, server, client, apps; apps may use `@travelta/domain` only for presentational rules) | all green |
| Browser journeys | 14 scripted journeys (M4–M22) driven over the Chrome DevTools Protocol against the production build: 222 checks, en + ar, no console errors | all green |
| Quality audit | 21 key screens × (1280 px light, 375 px dark): lang/dir, horizontal overflow, accessible names, form labels, image alt, dark theme applied | 42/42 |
| Mobile | typecheck, lint, `expo export` for iOS and Android | green; **not yet run on a simulator/emulator** (none installed on the build machine) |

Gaps against §3: the journeys are CDP scripts kept outside the repo rather than a committed Playwright suite, and the a11y pass is a custom audit rather than axe-core. Porting both into `apps/web/e2e` is the first task for the next phase.


## 7. Committed browser tests (16 Nov 2026)

The CDP scripts and the custom audit used during Stage B were reviewed and rewritten as a committed Playwright suite. It is **not** a copy: it uses role-based selectors, fixtures, isolated contexts, and axe-core in place of the hand-written audit. See `apps/web/e2e/README.md`.

- **Run:** `pnpm --filter @travelta/web e2e`. Playwright builds and starts the app on :3001 unless `E2E_BASE_URL` is set.
- **Coverage:** 33 tests, mapped to the acceptance scenarios A–H in the brief. Accessibility uses axe-core with the WCAG 2.1 A/AA tags on 26 screens, plus phone-width dark-mode scans.
- **Guards:** every test fails on console errors, page errors or HTTP 4xx/5xx.
- **Last run:** 33 / 33 passed.
- **Server-side additions:**
  - `admin-crud.test.ts`: platform CRUD, search visibility, dependency checks, tenant isolation, locations and maps;
  - `auth-recovery.test.ts`: reset, lockout, expiry, verification and favourites;
  - `finance-audit.test.ts`: the dashboard profit KPI re-derived from the ledger;
  - referential-integrity checks on import in `server.test.ts`.
