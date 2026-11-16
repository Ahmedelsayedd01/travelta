# Web end-to-end tests (Playwright + axe-core)

Real browser tests against the production build of the web app. Every test starts from freshly seeded demo data:
each test gets its own browser context, so the in-browser mock server gets its own IndexedDB.

## Run

```bash
pnpm --filter @travelta/web build           # once after code changes
pnpm --filter @travelta/web start           # serves http://localhost:3001 (keep running)
pnpm --filter @travelta/web e2e             # all tests (desktop + mobile projects)
pnpm --filter @travelta/web e2e -- --project=desktop e2e/hotel-map.spec.ts   # one file
pnpm --filter @travelta/web e2e:report      # open the HTML report (e2e-report/)
```

- **Browser:** the locally installed Google Chrome by default. To use Playwright's bundled Chromium instead, run `pnpm --filter @travelta/web exec playwright install chromium` and set `PW_CHANNEL=`.
- **Starting the server:** without `E2E_BASE_URL`, Playwright starts `pnpm build && pnpm start` itself, reusing a running server if one is up. Set `E2E_BASE_URL=http://localhost:3001` to point at a server you started.
- **Workers:** set `E2E_WORKERS=n` to change the number of parallel workers (default 3).

## Suites

| File | Covers |
|---|---|
| `admin-catalog.spec.ts` | Scenario A. Platform admin creates a hotel for a supplier with location and coordinates, adds a room type, edits it, publishes, pauses (gone from public search), reactivates (back), archives and deletes it, with the audit log. Also location management (destination + place, with server coordinate validation) and editing an agency profile. |
| `permissions.spec.ts` | Scenario G. Platform sees every management area. An agency opening another agency's booking by URL gets "not found". Supplier and customer are kept out of other portals. |
| `hotel-map.spec.ts` | Scenario B on desktop. Split list + map, marker → card and card → marker highlighting, filters kept across views, "search as I move the map" with an empty-area state, and the hotel location panel (coordinates, nearby places, directions). |
| `hotel-map.mobile.spec.ts` | Scenario B on a phone (Pixel 7). "Show map", tap a price pill to see a preview card, then "Show list". |
| `customer-auth.spec.ts` | Registration, email verification (OTP), forgot password (wrong code rejected), reset, and sign-in with the new password. No account enumeration. |
| `booking-lifecycle.spec.ts` | Scenarios C, D, E, F, H. Agency booking held on the wallet → supplier confirms on its board and sees the payable → invoice → payment collected → voucher → cancellation with fee and refund → trial balance balanced. Also a customer storefront booking with a card, My bookings and self-service cancellation. |
| `search-form.spec.ts` | Category switching: each of the 7 tabs shows its own fields, and the showcase shows that category's cards and photos. Validation: no errors before interaction; errors on submit next to their fields, cleared when fixed; visa nationality; same-airport flights; swap route. Date picker: disabled days, check-out following check-in, keyboard. Tabs and selects by keyboard. Arabic RTL. Reduced motion. |
| `services.spec.ts` | Search → results → details for each of the 7 services, and an Arabic customer journey. |
| `account-and-finance.spec.ts` | Customer favourites, the profit breakdown on the dashboard, and the custom-domain flow with the "DNS/SSL not connected" notice. |
| `accessibility.spec.ts` | axe-core WCAG 2.1 A/AA on 26 screens across public pages, admin, agency, supplier and customer. |
| `responsive.mobile.spec.ts` | Phone width + dark theme: no horizontal scrolling, plus axe on the main screens. |

## Conventions

- **Fixtures** (`fixtures.ts`): demo accounts, real-form `signIn` and `signOut`, `expectAccessible` (axe), `expectNoHorizontalOverflow`, `waitForContent`, `searchUrl` and `hittablePricePill`.
- **Console guard:** every test fails on browser console errors, page errors and HTTP 4xx/5xx responses. OpenStreetMap tile failures are ignored because they are third-party imagery.
- **Selectors:** prefer roles and accessible names. Fall back to `data-testid` where the UI already has one.
