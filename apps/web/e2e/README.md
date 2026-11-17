# Web end-to-end tests (Playwright + axe-core)

Real browser tests against the production build of the web app. **Every test starts from freshly seeded demo data:** each test gets its own browser context, so the in-browser mock server gets its own IndexedDB. Tests don't depend on each other or on their order.

Strategy, coverage and results: [`docs/QA/`](../../../docs/QA/).

## Run

```bash
pnpm --filter @travelta/web build                 # once after code changes
pnpm --filter @travelta/web start                 # serves http://localhost:3001 (keep running)
export E2E_BASE_URL=http://localhost:3001         # reuse that server (otherwise Playwright builds and starts it)

pnpm --filter @travelta/web e2e                   # everything (all projects)
pnpm --filter @travelta/web e2e:smoke             # stage 1
pnpm --filter @travelta/web e2e:functional        # stage 2: services + customer
pnpm --filter @travelta/web e2e:roles             # stage 3: admin, agency, supplier, security (+ service boundary)
pnpm --filter @travelta/web e2e:lifecycle         # stage 4: cross-role workflows, pricing, payments
pnpm --filter @travelta/web e2e:responsive        # stage 5: device matrix + accessibility
pnpm --filter @travelta/web e2e:cross-browser     # Firefox + WebKit (@smoke and @xbrowser tests)
pnpm --filter @travelta/web e2e:report            # HTML report (e2e-report/); JSON in e2e-report/results.json
```

- **Browsers:** Chromium projects use the locally installed Google Chrome (`PW_CHANNEL=` switches to Playwright's Chromium). Firefox and WebKit need `pnpm --filter @travelta/web exec playwright install firefox webkit`.
- **Workers:** `E2E_WORKERS=n` (default 3).
- **On failure:** a trace, a screenshot and a video are kept in `e2e-results/`.

## Layout

| Folder | Covers |
|---|---|
| `smoke/` | Landing, every service tab, each role signs in and **every page in its navigation renders** (heading, no error, no forbidden); performance probe (recorded, not asserted) |
| `services/` | All 7 services: search → details (`services.spec`), **booking → My bookings → cancel** (`booking-per-service.spec`), search form validation and category switching, hotel maps, landing visuals |
| `customer/` | Registration, OTP verification, password reset, account UX (profile menu, profile, bookings, travellers, favourites, support, settings), phone account navigation |
| `admin/` | Catalogue and locations CRUD, organisation edit, promo codes, KYC approval, team invitations, sub-agencies |
| `agency/` | Customers, wallet top-up approved by the platform (exact balance), markup rule versioning |
| `supplier/` | Net price → customer price (independent maths), product description → customers, isolation |
| `lifecycle/` | Agency B2B and customer B2C cycles across roles, supplier confirm or reject, stop-sell, trial balance |
| `finance/` | Price chain with **independently computed** expected values; declined, 3-D Secure, double submit, pay later; instalment due-date rule |
| `security/` | UI permissions; `*.service.spec.ts` calls the backend directly in Node with real tokens (no session, wrong role, cross-agency, cross-supplier, cross-customer, logout, suspension, one-level sub-agencies) |
| `responsive/` | `*.matrix.spec.ts` at 1440, 1920, 1024×768, 768×1024, 430, 390 and 375; phone journeys; dashboard selects and date pickers |
| `a11y/` | axe on 26 screens + open menus and dialogs + checkout steps + toasts in light and dark; keyboard and focus |
| `pages/` | Page objects: `SearchResults`, `OfferSheet`, `Checkout`, design-system `selectValue` / `pickDate` |
| `factories/` | Unique e-mails and names, dates relative to today, demo cards |
| `helpers/` | `demoBackend()` service-boundary harness |

## Conventions

- **Fixtures** (`fixtures.ts`): demo accounts, real-form `signIn` and `signOut`, `expectAccessible` (axe), `expectNoHorizontalOverflow`, `waitForContent`, `pickOption` / `chooseOption`, `nextPersist`, `searchUrl`.
- **Console guard:** every test fails on browser console errors, page errors and HTTP 4xx/5xx responses. The exceptions are OpenStreetMap tiles and WebKit's report of cancelled Next.js prefetches.
- **Reload after a write:** start `nextPersist(page)` before the action and await it before `page.reload()`. The demo backend stores its snapshot just after a write.
- **Money:** compute expected values in the test from the documented rules, never with the app's own engine.
- **Selectors:** roles and accessible names first; `data-testid` where the UI has one.
- **Tags:** `@smoke` and `@xbrowser` also run in Firefox and WebKit.
