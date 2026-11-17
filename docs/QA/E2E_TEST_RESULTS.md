# E2E test results

## Run environment

- **Date:** 17 Nov 2026.
- **Machine:** macOS (Darwin 25.5).
- **Web app:** production build (`next build && next start`) on localhost:3001.
- **Playwright:** 1.65.1.
- **Browsers:** Google Chrome (Chromium projects), Playwright Firefox 1572 and WebKit 2388.
- **Workers:** 4.

## Final full run: 194 / 194 passed

`E2E_BASE_URL=http://localhost:3001 E2E_WORKERS=4 pnpm --filter @travelta/web e2e`: **194 passed, 0 failed, 0 flaky, 0 skipped** in 6.0 min (`e2e-report/results.json`).

| Project | Passed | Failed |
|---|---:|---:|
| desktop (Chrome 1440×900) | 113 | 0 |
| desktop-1920 | 6 | 0 |
| tablet-landscape (1024×768) | 6 | 0 |
| tablet-portrait (768×1024) | 6 | 0 |
| mobile-430 / mobile-390 / mobile-375 | 6 / 6 / 6 | 0 |
| mobile (Pixel 7 journeys) | 6 | 0 |
| firefox | 15 | 0 |
| webkit | 15 | 0 |
| service (Node, backend boundary) | 9 | 0 |

### By spec file (runs across all projects)

| Area | Spec | Runs | | Area | Spec | Runs |
|---|---|---:|---|---|---|---:|
| smoke | smoke | 21 | | finance | pricing-chain | 7 |
| smoke | performance | 1 | | finance | payments | 8 |
| services | booking-per-service | 21 | | lifecycle | booking-lifecycle | 2 |
| services | services | 8 | | lifecycle | cross-role | 3 |
| services | search-form | 7 | | security | permissions | 4 |
| services | hotel-map (+ mobile) | 3 | | security | tenancy.service | 9 |
| services | storefront-visuals | 2 | | responsive | viewports.matrix | 42 |
| customer | account | 8 | | responsive | dashboard-controls | 7 |
| customer | customer-auth | 3 | | responsive | responsive.mobile | 4 |
| customer | account-and-finance | 3 | | a11y | accessibility | 12 |
| customer | account.mobile | 1 | | a11y | interaction | 6 |
| admin | admin-catalog | 3 | | agency | agency | 3 |
| admin | admin-management | 4 | | supplier | supplier | 2 |

## Other suites

| Suite | Command | Result |
|---|---|---|
| Expo Web (phone) | `pnpm --filter @travelta/mobile e2e:web` | **18 / 18 passed** |
| Unit tests (9 packages) | `pnpm turbo run test --force` | **351 passed**: shared 23, design-tokens 55, contracts 2, i18n 5, schemas 9, domain 60, mock-server 184, api-client 6, web 7 |
| TypeScript + lint | `pnpm turbo run typecheck lint --force` | **29 / 29 tasks passed**; lint 0 errors, 5 old React-Compiler warnings |
| E2E code typecheck | `tsc --noEmit -p apps/web/e2e` | Passed |

## Stability checks

The tests that were flaky or newly written were repeated under 4 parallel workers:
- `storefront-visuals`: 16/16 (×8);
- `a11y/interaction`: 48/48 (×8);
- `dashboard-controls`: 40/40 (×4);
- `account` + `customer-auth`: 66 runs (×3).

## Failure triage this round

| Failure | Classification | Action |
|---|---|---|
| Suspended agency could add to cart (service test) | **App bug B1** | Fixed in the backend; unit, service and UI tests added |
| Customer checkout showed "Choose a customer" (flight, activity) | **App bug B2** | Fixed; asserted in every customer checkout |
| Sub-agency compliance page loaded forever (smoke crawl) | **App bug B3** | Fixed |
| Promo code couldn't be deactivated; discount labelled "Markup" | **App bug B4** (missing control) | Fixed |
| Toast contrast 4.25:1 (axe with menu open) | **App bug B5** | Fixed with design tokens |
| Traveller date field overflowing the card; truncated bulk dates | **Regression B6** (previous round) | Fixed |
| Wrong field/label guesses: wallet response shape, catalog page size 100, "Stop sell" label, a team role is required, KYC panel stays open | Test bugs | Tests corrected to the app's real behaviour |
| Suspended org sign-in expectation | **Test expectation wrong**: the documented rule is "sessions revoked, sign-in allowed, booking refused" | Test now checks the documented rule |
| Customer booking auto-confirmed (no supplier step) | Test design: API-supplier offers confirm instantly | Tests pick the network-supplier offer |
| Reload right after saving lost the change | Demo-backend limitation (KNOWN_ISSUES K1) | Tests await the backend's "stored" broadcast |
| WebKit "access control checks" console errors | Environment: Safari reports cancelled Next.js prefetches | Narrow filter |
| Firefox/WebKit "Unsupported channel chrome" | Test config bug | Channel set per Chromium project |
| Offer sheet / drawer measured off screen | Test timing (mid-animation) | Measure after the animation settles |
| Landing photo "broken" (1 in 10) | Test artefact: forcing `loading=eager` on lazy images | Test now scrolls like a user |
| Dialog focus outside the trap (1 in 6) | Test timing: Base UI's focus guards | Poll after each Tab; the trap is still asserted 15 times |

No test was skipped and no assertion was removed to make a run pass.

## Performance (recorded, not asserted)

Production build on localhost, desktop Chrome, single run. No targets are set, because none are approved.

| Page | TTFB | DOMContentLoaded | Load | First contentful paint |
|---|---:|---:|---:|---:|
| `/en` landing | 5 ms | 37 ms | 125 ms | 52 ms |
| `/en/search` | 5 ms | 24 ms | 25 ms | 44 ms |
| `/en/account/login` | 5 ms | 12 ms | 61 ms | 40 ms |
| `/en/agency` dashboard | 8 ms | 15 ms | 15 ms | 104 ms |

- **First hotel search result:** ~0.93 s after navigation. That includes the demo backend's simulated supplier latency.
- **Agency dashboard:** content ready (skeletons gone) ~0.92 s after navigation.

Numbers on localhost exclude the network; they show relative cost only.
