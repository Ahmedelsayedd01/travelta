# Risks and Open Questions

## A. Resolved decisions (15 Nov 2026)
| # | Decision | Where documented |
|---|---|---|
| Q1 | Monorepo root is `/Documents/Fareq/travelta/`. Checked: it holds only `docs/` from Stage A, so nothing gets moved or overwritten. The v1 repo (`/Fareq/traveltta`) stays untouched. | `MONOREPO_ARCHITECTURE.md` |
| Q2 | The future backend is NestJS. Laravel is reference only. | `FUTURE_BACKEND_ARCHITECTURE.md` |
| Q3 | Don't wait for Figma/screenshots. Approved palette: Deep Teal `#0F766E`, Navy `#102A43`, Turquoise `#14B8A6`, Neutral `#F8FAFC`, White, Amber `#F59E0B`, Slate `#1E293B`. Full design system with light and dark themes and AA contrast. | `DESIGN_SYSTEM.md` |
| Q4 | Compounding markups: Net → Platform → Agency → Sub-Agency → Customer, as a complete configurable engine. | `PRICING_ENGINE.md` |
| Q5 | Platform markup applies to TBO, Hotelbeds and network suppliers, never to an agency's own inventory. Supplier commission is modelled separately from markup. | `PRICING_ENGINE.md §5` |
| Q6 | All commercial values are editable in the admin UI and flagged **DEMO**. None are hardcoded in the logic. | `PRICING_ENGINE.md §10`, `DATABASE_DESIGN.md §5` |
| Q7 | Global Travelta storefront plus optional agency-branded storefronts (branding, logo, colours, domain/subdomain, agency pricing). The mobile app is Travelta-branded. Bookings are tied to the selling org. | `FRONTEND_ARCHITECTURE.md §3a`, `TENANCY_AND_SECURITY.md §1` |
| Scope | **Full scope. Nothing is deferred.** All 7 services, all 4 portals + branded storefronts, and the mobile app, each with full business behaviour. Milestones organise the work but don't reduce it. | `IMPLEMENTATION_ROADMAP.md` |
| Data | Web and mobile share contracts, rules and the **same seed**. Persistence is per device, with **no sync claimed**. Reset plus JSON export/import are provided. | `MOCK_DATA_ARCHITECTURE.md §3` |

## B. Remaining questions (defaults apply unless you say otherwise)
| # | Question | Default used | Affects |
|---|---|---|---|
| Q8 | **Pay later on B2C**: allowed? With what limits? | Off by default; a storefront setting enables it | M13 |
| Q9 | **Customer cancellation fee**: supplier policy applied to the sell price (default), or the supplier fee passed through at cost? | Policy on sell + optional agency admin fee | M15 |
| Q10 | **Invoice discount/fees**: after tax (v1 behaviour) or before tax with tax recalculated? Pricing-engine promo discounts are already pre-tax. | Invoice-level adjustments after tax, as v1 | M15 |
| Q11 | **Instalments**: last instalment due before the service date? Minimum deposit? | Due ≤ service start; no minimum deposit | M13 |
| Q12 | **Voucher gating**: only when fully paid, or allowed on an active plan? | Paid in full or approved plan | M11 |
| Q13 | Supplier **second approval** per service line only, or also per product? | Per service line | M17 |
| Q14 | **Umrah**: own/extranet + manual-supplier packages only, or also a mocked Umrah wholesaler adapter? | No wholesaler adapter | M7 |
| Q15 | v1 back-office **HRM, tasks, channel manager, internal support tickets**: out of scope? | Out. B2C support tickets and promo codes are in. | Scope |
| Q16 | **Sub-agency depth**: one level only? | One level | M5, M9 |
| Q17 | **Tax base**: VAT on the full price (default) or a margin scheme (tax on markup only)? The engine supports both through tax profiles. | Full price, exclusive | M9 |
| Q18 | **Final rounding**: is the rounding adjustment pre-tax revenue of the final seller? | Yes | M9 |

## C. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| **Large agreed scope** (4 portals, branded storefronts, 7 services, full finance, mobile) | Long build; risk of shallow areas | Shared foundations first (pricing engine, booking/item model, adapters, checkout, ledger), then each service and portal completed to a defined **feature-complete checklist** (`IMPLEMENTATION_ROADMAP.md §Definition of done`). No milestone is closed with placeholder actions. |
| **Client-side "server" is not secure** | Demo data can be tampered with in devtools | Clearly labelled. Rules live in `domain`/`mock-server`, ready to move to the server. No real data. |
| **Ledger and settlement correctness** across partial payments, cancellations, refunds, commissions and FX | Reports don't reconcile | Property-based tests: trial balance zero, wallet = Σ transactions, AR = Σ open invoices, settlement waterfall = customer total; dedicated scenario tests for each combination. |
| **Pricing engine complexity** (specificity, guardrails, overrides, rounding) | Wrong prices, confusing UI | Pure functions with golden vectors and property tests. Pricing simulator UI that shows exactly why each rule matched. |
| **Expo + pnpm + Turbo + Next compatibility** | M1 delay | Verified first in M1, including `next build` and `expo export` (iOS + Android) running independently. |
| **RN RTL switch requires reload** | UX hiccup | A confirm dialog before reload; the locale is persisted first. |
| **Per-device data** (web vs mobile) | A booking made on mobile doesn't show on web | Stated in the UI and docs. JSON export/import in the Demo panel can move a dataset between devices manually. |
| **Storage size/performance** with full history and ledger | Slow boot | Chunked snapshots per collection, lazy report computation, boot-time budget measured in M3. |
| **Custom domains for agency storefronts** can't really be provisioned in a prototype | Misleading demos | Domain/subdomain configured and "verified" via a simulated DNS check; routing simulated through `/s/[slug]` and a host-mapping table; labelled Simulated. |
| **Next.js version changes** | Wrong API usage | Read the bundled Next docs in `node_modules/next/dist/docs` before writing code in M1. |
| **v1 data quality** | Bad assumptions | Seeds are generated fresh. Zod blocks invalid states (zero prices, duplicates, HTML in names). |
| **Real supplier certification later** | Adapter assumptions may be wrong | The adapter interface follows `search → recheck → book → cancel`. Mocks exercise multi-room, child ages, policies, vouchers and price changes. |
| **v1 repo has a committed `.env`** | Leaked secrets | Recommend rotating any credentials in it. Nothing from it is used in v2. |
