# Playwright test strategy

Travelta 2.0 is a prototype that runs entirely in the browser: the backend is a mock server (`@travelta/mock-server`) inside the page, persisted in IndexedDB. There is no real API, no real payment gateway and no real e-mail. The tests check the whole product as a user and as a set of roles: the screens, the business rules behind them, and how one role's action shows up for another.

## 1. Audit findings that shaped the plan

| Area | Finding |
|---|---|
| Monorepo | pnpm + Turborepo. `apps/web` is Next 16 (localhost:3001), `apps/mobile` is Expo SDK 58. The shared packages are `schemas`, `domain` (pricing, ledger, instalments), `mock-server`, `api-client`, `i18n` and `design-tokens`. |
| Existing tests | 351 unit tests (vitest) across 9 packages. The mock server alone has 184, covering tenancy, auth, checkout, pricing, finance, KYC and subscriptions. 18 Expo Web Playwright tests. 15 web Playwright spec files at the root of `apps/web/e2e`. |
| Test data | Deterministic seed (`seed/index.ts`): 13 organisations (platform, 6 agencies including one sub-agency, 6 suppliers), demo users for every role, products for all seven services, rules, wallets and history. |
| Reset | **Every Playwright browser context gets its own IndexedDB**, so every test starts from a freshly seeded dataset. No test can corrupt another's state, and order doesn't matter. |
| Running the app | `pnpm --filter @travelta/web build && pnpm --filter @travelta/web start` (port 3001). Expo Web: `pnpm --filter @travelta/mobile e2e:web` exports and serves on 8090. |
| Native mobile | This machine has no Xcode simulator, Android SDK/emulator or Maestro (`xcrun simctl`, `adb` and `emulator` are missing). See `NATIVE_MOBILE_TEST_RESULTS.md`. |
| Out of scope by decision | Q15: v1 back-office HRM, tasks, channel manager and internal support tickets. B2C support tickets and promo codes are in scope. |

## 2. Architecture

The infrastructure stays where the existing tests were (`apps/web/e2e`) instead of a second root-level `tests/`. That avoids duplicate configs, fixtures and browser installs. The folders follow the requested structure:

```text
apps/web/
  playwright.config.ts        projects: desktop, mobile, device matrix, firefox, webkit, service
  e2e/
    fixtures.ts               accounts, signIn/signOut, console guard, axe, overflow, nextPersist, pickers
    pages/                    page objects: storefront (search, offer sheet), checkout, controls (select, date picker)
    helpers/service.ts        Node harness for the mock backend (service-boundary tests)
    factories/data.ts         unique e-mails and names, relative dates, demo cards
    smoke/                    stage 1: app starts, every role's every navigation page renders; performance probe
    services/                 all seven services: search, details, booking, maps, visuals, form validation
    customer/                 auth, account UX, favourites
    admin/  agency/  supplier/ role suites (management, persistence after reload, cross-role effects)
    lifecycle/                cross-role workflows (book → supplier confirms or rejects → customer → admin → cancel → ledger)
    finance/                  pricing chain with independent maths, payment outcomes, instalments
    security/                 permissions in the UI + service-boundary tenancy tests
    responsive/               device matrix (*.matrix.spec.ts), phone journeys, dashboard controls
    a11y/                     axe scans, keyboard and focus, toast contrast
apps/mobile/e2e-web/          Expo Web (react-native-web) at phone size
```

### Projects

| Project | Browser / viewport | Runs |
|---|---|---|
| `desktop` | Chrome 1440×900 | Every functional, role, lifecycle, finance, security and a11y spec, plus the device matrix |
| `desktop-1920`, `tablet-landscape` (1024×768), `tablet-portrait` (768×1024), `mobile-430`, `mobile-390`, `mobile-375` | Chrome (touch on tablet and phone) | `responsive/*.matrix.spec.ts` |
| `mobile` | Pixel 7 | `*.mobile.spec.ts` touch journeys |
| `firefox`, `webkit` | Desktop Firefox / Safari 1440×900 | Tests tagged `@smoke` or `@xbrowser` |
| `service` | Node (no browser) | `security/*.service.spec.ts` |

### Conventions

- **Real UI, real rules:** tests click and type like users. Assertions read what the next role actually sees, never only a success toast.
- **Independent expected values:** money assertions are computed in the test from the documented, seeded rules, with integer minor units and half-up rounding. They never call the app's pricing engine.
- **Console guard:** every test fails on a console error, page error or HTTP 4xx/5xx. Narrow exceptions, each documented in `fixtures.ts`: map tiles, and WebKit's report of cancelled Next.js prefetches.
- **Persistence:** after a write that a test reads back through a reload, it awaits `nextPersist(page)`. That is the backend's own "snapshot stored" broadcast, not a timer.
- **Selectors:** roles and accessible names first. `data-testid` where the UI already has one. Three test hooks were added this round: `data-service` on booking items, `data-source` on offer options (that data was already sent to the client), and names on the promo dialog fields.
- **No skipped tests and no weakened assertions.** Where a test was wrong it was corrected, and each correction is listed in `E2E_TEST_RESULTS.md`.

## 3. Stages and commands

All commands run from the repository root. Build and start the web app once with `pnpm --filter @travelta/web build && pnpm --filter @travelta/web start`. Then add `E2E_BASE_URL=http://localhost:3001` to reuse that server; without it, Playwright builds and starts the app itself.

| Stage | Command |
|---|---|
| 1 Smoke | `pnpm --filter @travelta/web e2e:smoke` |
| 2 Functional (services, customer) | `pnpm --filter @travelta/web e2e:functional` |
| 3 Roles + service boundary | `pnpm --filter @travelta/web e2e:roles` |
| 4 Lifecycle + finance | `pnpm --filter @travelta/web e2e:lifecycle` |
| 5 Responsive + accessibility | `pnpm --filter @travelta/web e2e:responsive` |
| Cross-browser | `pnpm --filter @travelta/web e2e:cross-browser` (first: `pnpm --filter @travelta/web exec playwright install firefox webkit`) |
| Everything | `pnpm --filter @travelta/web e2e` |
| 6 Expo Web | `pnpm --filter @travelta/mobile e2e:web` |
| Unit, type and lint gates | `pnpm turbo run typecheck lint test` |
| Report | `pnpm --filter @travelta/web e2e:report` (HTML). Machine-readable: `apps/web/e2e-report/results.json` |

Failures keep a trace, a screenshot and a video in `apps/web/e2e-results/`.

### CI

The repository has no CI pipeline yet. The config is CI-ready: `retries: 1` when `CI` is set, the web server is started automatically, and HTML and JSON reports are written. A minimal job is `pnpm install`, then `pnpm exec playwright install --with-deps chromium firefox webkit`, then `PW_CHANNEL= pnpm --filter @travelta/web e2e`. `PW_CHANNEL=` uses Playwright's Chromium, because CI machines have no Google Chrome. **That job has not been run here.**
