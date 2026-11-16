# Platform audit and enhancement status (16 Nov 2026)

This document covers the Stage 1 audit (root causes and coverage) and what this round changed, with the verification behind each claim. The brief is very large. Where something is **not** done, it says so. Business rules waiting for your decision are in `BUSINESS_DECISIONS_FOR_APPROVAL.md`.

## 1. Why admin CRUD did not work (root causes, fixed)

| # | Root cause | Where | Fix |
|---|---|---|---|
| 1 | The server refused every catalog write by the platform ("The platform curates the catalog"). The tenant check also treated another owner's product as "not found" for writes. | `mock-server/operations/catalog.ts` | The platform now creates (choosing the owning supplier or agency), edits, publishes, pauses, archives, restores and deletes any product. The owner's rules still apply: approved service lines, and KYC before going live. |
| 2 | The UI hid every write action from the platform: `canManage = useCan('inventory.manage') && orgType !== 'platform'`. | `web/features/catalog/products-page.tsx` | The check is permission-only now; the server stays authoritative. |
| 3 | Actions without a form failed **silently**. `useAction` suppressed the error toast whenever the server error carried field details (for example a `CONFLICT` on delete or a status change). | `web/lib/mutations.ts` | A toast is shown unless a form actually displayed the field errors (`applyFieldErrors` / `takeFieldErrors` mark them). No action can fail silently any more. |
| 4 | Missing operations: the platform couldn't edit an agency or supplier profile, manage destinations or places, or delete a product. Products had no archive state. | contracts, schemas, mock server | Added `orgs.update`, `destinations.save/delete`, `places.list/save/delete/hotelLocation`, `catalog.delete`, and the `archived` status, all audited with before and after values. |
| 5 | Lists and details showed a generic "Something went wrong" for "not found / not yours", which looks like a temporary error. | `web/components/feedback/states.tsx` | `QueryErrorState` shows "Not found / no access" without a retry, and the real reason otherwise. |

Checks that showed **no** problem:
- **Permission definitions:** the super admin gets every platform permission.
- **Repositories:** all have mutation methods inside transactions.
- **Cache invalidation:** after mutations, `useAction` invalidates the affected queries.
- **Persistence:** data is in IndexedDB and survives navigation and refresh.

## 2. Platform admin CRUD coverage

✅ means the server operation and the UI action both exist and are tested. ◐ means partial. ✗ means not built.

| Entity | List / search / filter / page | Create | View | Edit | Delete / archive | Status | Audit | Notes |
|---|---|---|---|---|---|---|---|---|
| Products (all 7 services) | ✅ | ✅ (for an owner) | ✅ | ✅ | ✅ delete if never booked, otherwise archive | ✅ draft / live / paused / archived | ✅ | e2e scenario A |
| Room types / rate units | ✅ | ✅ | ✅ | ✅ | ✅ remove unit | — | ✅ | inside the product editor |
| Rates and availability (calendar) | ✅ | — | ✅ | ✅ bulk by date / weekday | — | stop-sell | ✅ | |
| Destinations | ✅ | ✅ | ✅ | ✅ | ✅ only if unused, otherwise deactivate | ✅ active / popular | ✅ | |
| Places (attractions, airports, transit, neighbourhoods) | ✅ | ✅ | ✅ map | ✅ | ✅ | ✅ | ✅ | coordinates validated |
| Organizations (agencies, sub-agencies, suppliers) | ✅ | ◐ (self-signup + KYC; sub-agencies by the parent) | ✅ | ✅ new | — (suspend instead) | ✅ suspend / reactivate | ✅ | there is no admin "create organization" form |
| KYC documents and service lines | ✅ | — | ✅ | — | — | ✅ approve / reject | ✅ | |
| Staff, roles, permissions | ✅ | ✅ invite / custom roles | ✅ | ✅ | ✅ delete custom role | ✅ disable member | ✅ | |
| Pricing / markup rules | ✅ | ✅ | ✅ versions | ✅ (new version) | ◐ deactivate by version | ✅ | ✅ | |
| Taxes, fees, commercial settings | ✅ | ✅ | ✅ | ✅ | ◐ | — | ✅ | |
| Promo codes | ✅ | ✅ | ✅ | ✅ | ◐ deactivate | ✅ | ✅ | |
| Subscription plans and agency subscriptions | ✅ | ✅ plans | ✅ | ✅ | — | ✅ admin actions (suspend / reactivate / extend trial) | ✅ | |
| Bookings and booking details | ✅ | ✅ (Direct storefront / agency) | ✅ | ✅ ops details, notes | — (cancellation workflow) | ✅ confirm / reject / voucher / no-show | ✅ | |
| Payments, refunds, cancellations | ✅ | ✅ collect | ✅ | ✅ plan | — reversal only | ✅ approve refund | ✅ | financial records are never deleted |
| Invoices and credit notes | ✅ | ✅ (at confirmation) | ✅ printable | ✅ after-tax adjustments | ✗ (credit note instead) | — | ✅ | |
| Wallets and credit limits | ✅ | — | ✅ transactions | ✅ limit / freeze | — | ✅ | ✅ | the platform can't override sub-agency limits (decision A3) |
| Accounting (chart, journal, expenses, transfers) | ✅ | ✅ | ✅ | ✅ accounts | ✅ reversal | — | ✅ | |
| Customers | ◐ the platform sees Travelta Direct customers | ✅ | ✅ 360 | ✅ | ✗ | — | ✅ | no cross-tenant customer admin |
| Notifications / outbox | ✅ | — | ✅ | — | — | ✅ read | — | |
| Audit log | ✅ cross-tenant for the platform | — | ✅ | — | — | — | — | |
| Reports | ✅ 9 reports + CSV | — | ✅ | — | — | — | — | |
| **CMS: homepage banners, featured content, offers** | ◐ "popular" destinations only | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | not built |
| **Reviews and moderation** | ✗ (rating and count stored on products) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | not built |
| **Support tickets (admin side)** | ◐ tickets go to the outbox and notifications | ✅ customer | ◐ | ✗ | ✗ | ✗ | ✗ | no ticket queue |
| **Newsletter subscribers** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | not built |
| **Currencies / exchange rates** | ✅ view | ✗ | ✅ | ✗ | ✗ | ✗ | — | seeded, read-only |
| **Languages, feature flags** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | not built |

## 3. Permission matrix (enforced server-side; the UI only hides)

✅ means allowed. "own" means limited to the caller's organisation (and its sub-agencies for agencies). Another tenant's record always answers "not found".

| Capability | Super admin | Compliance ops | Agency owner | Sales agent | Operations | Accountant | Sub-agency owner | Supplier admin | Supplier staff | Customer |
|---|---|---|---|---|---|---|---|---|---|---|
| Organizations: view / manage | ✅ / ✅ | ✅ / ✅ | own | — | — | — | own | own | — | — |
| KYC review | ✅ | ✅ | own docs | own docs | own docs | own docs | own docs | own docs | own docs | — |
| Catalog / inventory: view / manage | ✅ / ✅ all | ✅ / — | own / own | own / — | own / own | — | own / own | own / own | own / own | — |
| Locations (destinations, places) | ✅ | — | — | — | — | — | — | — | — | — |
| Pricing rules / simulate | ✅ | — | own | view | — | — | own | — | — | — |
| Bookings: view / create | ✅ all / Direct | ✅ all / — | own / own | own / own | own / — | own / — | own / own | own items / — | own items / — | own trips / own |
| Confirm / reject supplier items | ✅ | — | own extranet | — | own extranet | — | own extranet | own | own | — |
| Voucher / cancel | ✅ | — | own | — | own | — | own | — | — | cancel own |
| Payments collect / refund approve | ✅ | view | own | collect / request | — | own / own | own | — | — | pay own |
| Wallet / credit limits | ✅ (agencies) | ✅ | own + sub-agencies | view | — | view | own | — | — | — |
| Accounting | ✅ platform ledger | — | own | — | — | own | own | statement | — | — |
| Subscriptions / plans | ✅ / ✅ | — | own / — | — | — | — | own / — | — | — | — |
| Storefront and domain | — | — | own | — | — | — | — | — | — | — |
| Team and roles | ✅ | view | own | — | — | — | own | own | — | — |
| Audit log | ✅ all tenants | ✅ | own | — | — | — | own | own | — | — |
| Favourites and profile | — | — | — | — | — | — | — | — | — | own |

**How these were verified:**
- Server tests: `auth.test.ts`, `organizations.test.ts`, `catalog.test.ts` and `admin-crud.test.ts` (tenant isolation on get, status and delete; location management platform-only).
- e2e `permissions.spec.ts`: cross-agency booking URL returns "not found", and the portals are closed to the wrong roles.

## 4. Business workflow coverage, seven services

| Capability | Hotels | Flights | Tours | Visas | Umrah | Activities | Buses / transfers |
|---|---|---|---|---|---|---|---|
| Search form, validation, filters, sort, paging | ✅ | ✅ one-way | ✅ | ✅ | ✅ | ✅ | ✅ |
| Availability + price recheck before booking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Booking lifecycle (state machine, idempotent submit) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payment (full / partial / instalments / card / wallet) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Supplier confirmation and voucher / ticket | ✅ | ✅ PNR / ticket no. | ✅ | ✅ | ✅ | ✅ | ✅ driver / bus no. |
| Cancellation with policy fee + refund | ✅ | ✅ | ✅ | ✅ non-refundable | ✅ | ✅ | ✅ |
| Accounting, invoices, supplier payables | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Map and location | ✅ results map + hotel location | — | ◐ destination only | — | ◐ | ◐ | ◐ |
| Service-specific depth | ✅ multi-room, child ages, meal plans, seasons | ◐ **no round-trip / multi-city, no reissue** | ◐ itinerary, inclusions; **no group-size limits** | ◐ documents per traveller; **no application review stages** | ✅ Makkah / Madinah nights, inclusions, departure city | ✅ time slots, capacity | ◐ private / shared, capacity; **no seat map, no luggage rules** |
| Amendments | ◐ ops details only (no date or room change with repricing) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

The booking state machine uses item states pending, confirmed, vouchered, travelled, cancelled, rejected and no-show, with hold reasons (awaiting supplier, payment, credit approval, price changed). The booking-level status adds partially confirmed. It does **not** implement the brief's longer list of states (amendment requested, refund pending, partially refunded, and so on). Refund state is tracked on cancellations instead. Extending it is listed in §7.

## 5. Maps (delivered)

- **Web:** Leaflet 1.9.4 with OpenStreetMap-compatible tiles behind a provider setting (`NEXT_PUBLIC_MAP_TILE_URL`, no key).
  - **Results:** List, List + map and Map views. Price pills link both ways with the cards (selection and hover). "Search as I move the map" sends the visible area to the server as a filter. Distance sort. An empty-area state. Filters are kept when switching views. On phones: "Show map" and "Show list".
  - **Hotel details:** an interactive map with the hotel pin and nearby attractions, airports, transit and neighbourhoods, plus distances, the address, coordinates and a directions link.
  - **Admin:** hotel coordinates through a map picker (click or drag), latitude and longitude fields, and the neighbourhood. Location management for destinations and places on a map.
  - **Resilience:** the server validates coordinates (range, null island, distance from the destination). If tiles fail, a notice appears and the markers stay.
- **Mobile:** the same provider through Leaflet inside a WebView (no native SDK keys). Includes a results map with preview cards and a hotel location card. *Not run on a device; see `MOBILE_TESTING.md`.*
- **Data:** 12 destination centres, about 75 real places, and seeded hotel coordinates. Mock API hotels get deterministic positions (labelled as approximate).

## 6. Data relationships

- **Import:** validates the schema version, each row against its entity schema, duplicate IDs, and the **references** listed below (new this round).
- **References checked on import:**
  - membership → user, organisation, role;
  - product → owner, destination;
  - place → destination;
  - favourite → user;
  - booking → seller, customer;
  - item → booking, product;
  - payment, invoice, cancellation → booking;
  - credit note → invoice;
  - wallet transaction → wallet;
  - journal lines → accounts of the same tenant.
- **Other guarantees:**
  - Booking creation checks the customer, product and seller.
  - A voucher requires a confirmed item.
  - A refund requires a booking and can never exceed what is refundable.
  - Deletes are refused when dependants exist.

## 7. Not done in this round (honest scope list)

- **Admin modules:**
  - CMS (banners, offers, featured content);
  - review moderation;
  - a support-ticket queue;
  - newsletter;
  - currency and exchange-rate editing;
  - languages and feature flags;
  - an admin "create organization" form.
- **Lifecycle and amendments:**
  - amendments with repricing;
  - the extended booking states from the brief;
  - flight round-trip, multi-city and reissue;
  - visa application review stages;
  - tour group-size limits;
  - bus seat maps and luggage rules;
  - debit notes;
  - customer wallets.
- **Customer web:** the landing page has search, services and promotions, but **not** the full marketing set in the brief (testimonials, newsletter, how it works). There is no currency switcher in the header.
- **Mobile:** not run on a device (no simulator on this machine).

## 8. Verification (commands actually run, 16 Nov 2026)

| Gate | Result |
|---|---|
| `pnpm turbo run typecheck lint` | 20 / 20 tasks passed. 5 lint *warnings* already existed in early web screens (react-hook-form / React Compiler notices), 0 errors. |
| `pnpm turbo run test` | **336 tests passed**: design-tokens 55, shared 21, contracts 2, domain 60, schemas 9, i18n 5, api-client 6, mock-server 178. |
| `pnpm --filter @travelta/web build` | Passed (production build, used by the e2e run). |
| Playwright e2e (`apps/web/e2e`) | **33 / 33 passed** (desktop + Pixel 7 projects), including axe-core WCAG 2.1 AA scans on 26 screens. |
| `expo export --platform ios --platform android` | Passed (both bundles). |
| Mobile on a device or simulator | **Not run**: none available here. |

Real defects found and fixed by the new browser tests:
- **Axe findings:**
  - brand link name mismatch;
  - notification badge contrast in dark mode;
  - report hint contrast;
  - scrollable tables not keyboard-focusable;
  - an ARIA attribute on the star rating.
- **Other defects:**
  - Result cards overlapped in the split list + map view (now responsive to their container).
  - The map broke when a filter emptied the results (`_leaflet_pos` error; the map now stays mounted).
  - Cross-tenant URLs showed a generic error.
