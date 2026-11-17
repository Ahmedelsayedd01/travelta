# Project test coverage

**Legend:**
- **Browser:** Playwright E2E.
- **Service:** direct backend calls with real tokens (`*.service.spec.ts`).
- **Unit:** vitest in `domain` / `mock-server`.
- ❌ **Not implemented:** the feature doesn't exist, so it can't be tested.

Status is from the 17 Nov 2026 runs. Every listed test passed.

## By user role

### Customer
- **Browser, auth:** register, OTP verification, forgot and reset password, wrong password, sign in and out, session persistence, protected routes with `next`.
- **Browser, account:** profile menu (logged out and in), profile edit and validation, password change, bookings tabs, travellers CRUD (used at checkout), favourites, support tickets, settings (language, theme, unsupported items labelled). The notifications page renders; mark-as-read isn't asserted in the browser.
- **Browser, booking:** every service booked end to end and cancelled; payments (declined, 3-D Secure, double submit, pay later); **no admin dashboard**.
- **Service:** isolation from other customers; no supplier cost exposed.
- **Gaps:** amendments ❌; currency and notification preferences ❌; e-mail change ❌.

### Platform admin
- **Browser:**
  - every navigation page renders;
  - catalogue product create, edit, publish, pause, reactivate, archive and delete with audit;
  - locations;
  - organisation edit;
  - KYC review → approve → the agency can book;
  - top-up approval;
  - bookings and finance panel;
  - trial balance;
  - pricing simulator for any agency.
- **Service:** suspension revokes sessions and blocks booking; reactivation.
- **Gaps:**
  - CMS ❌;
  - support-ticket queue ❌ (Q15);
  - bulk operations ❌;
  - platform users CRUD in the UI (team invitations tested for agencies);
  - subscription plan editing UI (unit-tested);
  - report figures (pages render; numbers not asserted).

### Agency
- **Browser:**
  - every navigation page renders;
  - search and book (B2B, wallet hold) with a customer;
  - supplier confirmation → invoice → collect → voucher → cancellation with fee and refund → balanced;
  - customers create, find, edit and 360;
  - wallet top-up → exact balance;
  - markup rule edit with versions and price effect;
  - promo codes;
  - team invite;
  - sub-agency creation;
  - instalment rule.
- **Service:** cross-agency isolation (booking, customer, wallet).
- **Gaps:**
  - branded-storefront purchase in the browser (the storefront page is scanned; branded checkout is unit-tested);
  - report figures;
  - CRM pipeline actions (unit-tested; page renders).

### Sub-agency
- **Browser:** every navigation page renders; no sub-agency management; compliance page explains parent coverage. The sub-agency layer compounds in the simulator.
- **Service:** cannot create a sub-agency (one level).
- **Gap:** a sub-agency booking flow in the browser.

### Supplier
- **Browser:** every navigation page renders; reservations board confirm and reject; payables; stop-sell and open-sale → customer availability; net price → customer price (exact delta); description edit → customers.
- **Service:** cross-supplier isolation (read, delete, list).
- **Gaps:** service-line second approval in the UI (unit-tested in KYC); commission statements beyond payables.

## By travel service

| Service | Search + validation | Results, photo, category card | Details, policy | Book + pay | My bookings | Cancel + refund | Pricing chain | Expo Web |
|---|---|---|---|---|---|---|---|---|
| Hotel | ✅ | ✅ (+ map) | ✅ | ✅ | ✅ | ✅ | ✅ network, agency-own, sub-agency, promo | search + book |
| Flight | ✅ (same-airport rule, swap) | ✅ | ✅ | ✅ (passports) | ✅ | ✅ | ✅ no VAT | search |
| Tour | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ fixed per person | search |
| Visa | ✅ (nationality) | ✅ | ✅ | ✅ (document upload) | ✅ | ✅ | — | search |
| Umrah | ✅ | ✅ | ✅ | ✅ (mahram) | ✅ | ✅ | ✅ Umrah platform rule | search |
| Activity | ✅ | ✅ | ✅ | ✅ (time slot) | ✅ | ✅ | ✅ defaults | search |
| Buses & transfers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | search |

**Category switching:** each tab shows its own fields, validation and showcase cards and photos (`services/search-form.spec.ts`). Reduced motion and RTL are covered.

## By implementation phase

| Phase (IMPLEMENTATION_ROADMAP) | Evidence |
|---|---|
| Foundations, design system, i18n | Design-token contrast unit tests; axe; RTL in browser, Expo and matrix |
| Auth, onboarding, tenancy | auth unit tests (29); customer-auth; account; permissions; service-boundary suite |
| Catalogue, inventory, rates | admin-catalog; supplier suite; stop-sell lifecycle |
| Search (7 services), maps | services; search-form; hotel-map; booking-per-service |
| Pricing engine | 16 engine + 9 pricing unit tests; pricing-chain (7); promo; markup versioning |
| Cart, checkout, payments | checkout unit tests (14); payments (6); per-service bookings |
| Booking lifecycle, suppliers | lifecycle unit tests (9); cross-role (3); booking-lifecycle (2) |
| Finance, wallet, ledger, invoices | finance (13) + ledger (13) + instalments (15) unit tests; top-up; trial balance |
| KYC and compliance | kyc unit tests (8); KYC approval journey; eligibility (bug B1) |
| Subscriptions | 5 + 3 unit tests; admin subscriptions page renders and is scanned |
| CRM | 4 + 3 unit tests; page renders and is scanned |
| Customer account UX | account (8) + mobile (1) + smoke |
| Mobile app | Expo Web 18; native ❌ untested (no simulator or emulator) |

## Not implemented (requested by the QA brief)

- CMS content.
- Admin support-ticket queue (Q15).
- Booking amendments.
- Bulk operations.
- General import/export (only the demo JSON export/import exists).
- Customer currency and notification preferences.
- Account e-mail change.
- Native E2E automation (Maestro / Detox).
