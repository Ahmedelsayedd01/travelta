# Travelta 2.0: frontend prototype

Monorepo for the Travelta 2.0 B2B/B2C travel platform prototype. **No backend in this phase.** All business logic runs against simulated, persisted mock data. See `docs/` for architecture, rules and roadmap.

## Requirements
- Node ≥ 22 (developed on Node 26)
- pnpm 12 (`packageManager` is pinned in `package.json`)

## Commands (from the repo root)
| Command | What it does |
|---|---|
| `pnpm install` | Install all workspaces |
| `pnpm dev:web` | Next.js dev server at http://localhost:3001 (`/en`, `/ar`) |
| `pnpm dev:mobile` | Expo dev server (scan with Expo Go or run a dev build) |
| `pnpm check` | Typecheck + lint + unit tests across all packages |
| `pnpm build:web` | Production web build |
| `pnpm export:mobile` | Production JS bundles for iOS and Android (`apps/mobile/dist`) |

## Layout
```
apps/web        Next.js: admin, agency, supplier portals + storefronts
apps/mobile     Expo Router: B2C customer app
packages/*      shared contracts, schemas, domain rules, mock server, api client, i18n, tokens, configs
docs/           Stage A architecture and business documentation
```

## Try it (demo)
Every account uses the demo password shown on the sign-in pages; the **Demo tools** button (bottom corner) resets data, moves the demo clock, forces supplier responses and exports/imports the dataset. The demo starts with ~6 months of booking history.

| Where | URL | Quick sign-in |
|---|---|---|
| Travelta Direct storefront | http://localhost:3001/en | `customer@example.com` (Customer sign-in) |
| Agency-branded storefront | http://localhost:3001/en/s/nile-horizon · http://nilehorizon.localhost:3001 | `traveller@nilehorizon.example` |
| Business portals | http://localhost:3001/en/login | Platform `admin@travelta.demo` · Agency `owner@nilehorizon.demo`, `sales@…`, `accounts@…` · Sub-agency `owner@deltagate.demo` · Supplier `supplier@pharaohstays.demo` |

Test cards: `4242 4242 4242 4242` succeeds · `4000 0000 0000 0002` declines · `4000 0000 0000 3220` asks for 3-D Secure code `123456`. Promo code: `WELCOME10` (Travelta Direct).

## Quality gates
- `pnpm check`: typecheck, lint (including package-boundary rules) and 336 unit/integration tests. These include dedicated financial tests (ledger balance, wallets, instalments, cancellations, the profit-KPI audit), cross-app contract tests and seed determinism.
- `pnpm --filter @travelta/web e2e`: 33 Playwright browser tests, including axe-core WCAG 2.1 AA scans. See `apps/web/e2e/README.md`.
- `pnpm --filter @travelta/mobile e2e:web`: 18 Playwright tests of the mobile app rendered by Expo Web (phone size).
- `pnpm --filter @travelta/mobile web`: run the mobile app in a browser. This doesn't replace device testing.
- `pnpm export:mobile`: iOS and Android bundles. Device testing steps are in `docs/MOBILE_TESTING.md`.

## Documents for review
- `docs/BUSINESS_DECISIONS_FOR_APPROVAL.md`: business rules implemented without explicit approval, with options and recommendations.
- `docs/FINANCIAL_VERIFICATION.md`: the 30-day profit figure traced line by line to the ledger.
- `docs/PLATFORM_AUDIT.md`: feature, CRUD, permission and workflow coverage, and what remains.
- `docs/PROJECT_COMPLETION_AUDIT.md`: milestone status after Stage 2, fixed bugs, the image mapping and platform support.
