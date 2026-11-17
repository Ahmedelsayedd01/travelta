# Final QA report: Travelta 2.0

17 November 2026. Branch `qa-e2e`. Every figure below comes from executed runs (details in `E2E_TEST_RESULTS.md`).

## 1. Overall status

The web platform works end to end across roles, services and devices in the tested scope:
- **194 / 194** web Playwright runs passed in 11 projects: Chrome at 7 viewports, Pixel 7, Firefox, WebKit and a Node service-boundary project.
- **18 / 18** Expo Web tests and **351** unit tests passed.
- TypeScript and lint are clean (5 old warnings).

The round found **5 application bugs and 1 regression**, all fixed with regression tests. One was a high-severity business-rule gap: non-active agencies could book.

**Not established:** native Android/iOS behaviour (no simulator or emulator here), and features that don't exist (CMS, ticket queue, amendments, bulk operations).

## 2. Results table

| Test area | Total tests | Passed | Failed | Blocked | Not implemented |
|---|---:|---:|---:|---:|---:|
| Smoke (start, every role's every nav page, perf probe) | 22 | 22 | 0 | 0 | 0 |
| Travel services (search, validation, details, maps, visuals, booking ×7) | 41 | 41 | 0 | 0 | 0 |
| Customer (auth, account UX, favourites) | 15 | 15 | 0 | 0 | 3 (amendments, preferences, e-mail change) |
| Admin (catalogue, locations, orgs, promos, KYC, team, sub-agencies) | 7 | 7 | 0 | 0 | 3 (CMS, ticket queue, bulk operations) |
| Agency (customers, wallet top-up, markup versions) | 3 | 3 | 0 | 0 | 0 |
| Supplier (price → customer, content, isolation) | 2 | 2 | 0 | 0 | 0 |
| Business lifecycle (cross-role) | 5 | 5 | 0 | 0 | 0 |
| Pricing, payments, accounting | 15 | 15 | 0 | 0 | 0 |
| Security: UI permissions + service boundary | 13 | 13 | 0 | 0 | 0 |
| Responsive (7-viewport matrix, phone journeys, dashboard controls) | 53 | 53 | 0 | 0 | 0 |
| Accessibility (axe + keyboard/focus) | 18 | 18 | 0 | 0 | 0 |
| **Web Playwright total** | **194** | **194** | **0** | **0** | — |
| Expo Web | 18 | 18 | 0 | 0 | — |
| Native Android / iOS | — | — | — | **all** (no simulator/emulator) | Maestro/Detox not set up |
| Unit (9 packages) | 351 | 351 | 0 | 0 | — |

The cross-browser runs are included in the area rows: Firefox 15/15 and WebKit 15/15, covering smoke, all seven bookings and the declined card.

## 3. Coverage

- **By phase:** see `PROJECT_TEST_COVERAGE.md`.
- **By role:** customer, platform admin, agency, sub-agency and supplier each have dedicated browser suites plus service-boundary checks.
- **By service:** all seven are tested from search to cancellation for customers, in Chrome, Firefox and WebKit, with service-specific traveller data:
  - flights: passports;
  - visas: document upload;
  - Umrah: mahram;
  - activities: time slot.

## 4. Complete business workflows tested

Twelve cross-role workflows are listed in `BUSINESS_LIFECYCLE_RESULTS.md`, including:
- **B2C:** customer → supplier confirm → paid → admin → cancel with refund → ledger balanced.
- **Supplier rejection.**
- **Stop-sell** removes availability.
- **Agency B2B:** wallet → supplier → invoice → payment → voucher → cancellation fee and refund → balanced.
- **Supplier net price** → exact customer price delta.
- **Wallet top-up** approved by the platform.
- **Markup versioning.**
- **Promo** lifecycle.
- **KYC** approval unblocking bookings.

## 5. Desktop, tablet and mobile

All 42 matrix runs passed at 1440, 1920, 1024×768, 768×1024, 430, 390 and 375. Phone journeys passed on Pixel 7. See `RESPONSIVE_TEST_RESULTS.md`.

## 6. Expo Web

18/18: onboarding, auth, tabs, seven-service search, hotel map and booking, favourites, RTL, axe.

## 7. Native Android / iOS

**Untested.** The machine has no Xcode simulator, Android SDK/emulator or Maestro. The device checklist is in `docs/MOBILE_TESTING.md`. Expo Web results are not a substitute.

## 8. Authentication and permissions

The service-boundary suite (9, run in Node with real tokens) checks:
- no session → `UNAUTHENTICATED`;
- customer → staff operations refused;
- agency ↔ agency: booking, customer and wallet are `NOT_FOUND`;
- supplier ↔ supplier: product read and delete refused;
- customer ↔ customer: bookings isolated, no supplier cost exposed;
- logout revokes the token;
- suspension revokes sessions and blocks booking until reactivation;
- pending-KYC and expired-document agencies can't book;
- sub-agencies can't nest.

The UI suites cover protected routes, role redirects and isolation by URL.

## 9. Pricing, payment, refund and accounting

The seven price-chain cases match **independently computed** values to the cent:
- network vs agency-own stock;
- fixed per-person markups;
- no VAT on flights;
- the Umrah platform rule;
- sub-agency compounding with the platform layer hidden;
- promo discount.

Also tested:
- declined, 3-D Secure, double submit (one booking), authorised then captured, pay later;
- instalment final date ≤ service start;
- refunds on cancellation;
- trial balance balanced after both cycles.

## 10. Accessibility

axe WCAG 2.1 AA is clean on 26 page states plus open menus and dialogs, the checkout steps, the sub-agency KYC page, and toasts in light and dark. Keyboard and focus behaviour passes (menu, dialog trap and return, selects, date grid). No manual screen-reader pass was done.

## 11. Bugs discovered

See `KNOWN_ISSUES.md`.

1. **B1 (high):** non-active (pending-KYC, expired-documents, suspended) agencies could book.
2. **B2 (high):** a customer checkout could get stuck on the staff-only customer step.
3. **B3:** the sub-agency compliance page loaded forever.
4. **B4:** promo codes couldn't be deactivated, and the discount was labelled "Markup".
5. **B5:** success-toast contrast was 4.25:1 (WCAG AA failure).
6. **B6:** regressions from the previous round: a date field overflowed the traveller card, and bulk dates were truncated.

## 12. Bugs fixed

All six. Each has a regression test, and B1 also has a server unit test.

## 13. Remaining blockers and limitations

None block the web prototype. Open items (K1–K8):
- the demo backend loses a write if the page reloads within a moment of saving (not an issue with a real backend);
- WebKit prefetch-abort console noise is filtered;
- no demo control to force supplier responses;
- not-implemented features;
- native mobile untested;
- Expo Web books hotels only;
- no CI pipeline.

## 14. Commands

```bash
pnpm turbo run typecheck lint test                       # unit, type and lint gates (351 unit tests)
pnpm --filter @travelta/web build && pnpm --filter @travelta/web start   # web on :3001
export E2E_BASE_URL=http://localhost:3001
pnpm --filter @travelta/web exec playwright install firefox webkit      # once, for cross-browser
pnpm --filter @travelta/web e2e                          # all 194 runs, all projects
pnpm --filter @travelta/web e2e:smoke | e2e:functional | e2e:roles | e2e:lifecycle | e2e:responsive | e2e:cross-browser
pnpm --filter @travelta/web e2e:report                   # HTML report
pnpm --filter @travelta/mobile e2e:web                   # Expo Web (18)
```
