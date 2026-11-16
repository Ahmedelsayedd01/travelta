# Travelta 2.0 — System Overview

> Stage A deliverable. Describes the product, the scope of the **frontend prototype phase**, and how it relates to Travelta v1 and the proposal.

## 1. Sources analysed

| Source | Location | Used for |
|---|---|---|
| Business proposal | `~/Downloads/Travelta-2.0-Proposal.pdf` (12 pages, 15 Nov 2026) | Scope, roles, KYC, pricing formula, lifecycle, payments, accounting, commercial model |
| Travelta v1 (Laravel 9 + Bootstrap/Vuexy) | `/Documents/Fareq/traveltta` | Existing workflows, table design, status values, field lists per service |
| Master prompt (this engagement) | — | Tech stack, phase restrictions, deliverables |

**Conflict resolved:** the proposal recommends Laravel 11 as the API. The master prompt says the future backend is **NestJS** and that Laravel isn't used. The master prompt wins. Laravel is reference only.

## 2. What Travelta 2.0 is

A multi-tenant travel platform with three levels of users:

1. **Platform (Travelta)**: licensed company. It onboards agencies and suppliers, resells wholesale stock (TBO Holidays and Hotelbeds, simulated in this phase) with a platform markup, sells SaaS plans, and takes supplier commission.
2. **Tenants**:
   - **Agencies**, with optional **sub-agencies** (sub-agents who book at the parent agency's B2B price from their own login and wallet).
   - **Suppliers**, who manage their own stock, rates and availability for approved service lines.
3. **End customers (B2C)**: search, book, pay, download vouchers and submit enquiries, on the web storefront and the mobile app.

### Service lines (7)
Hotels · Flights · Tours · Visas · Umrah · Activities · Buses & Transfers. All seven go through **one cart**, so one booking can hold a hotel, a flight and a visa.

### Inventory sources
Each product line can come from:
- **Extranet**: contracted stock entered by the platform, an agency or a supplier.
- **Manual supplier**: an off-line supplier. Ops confirm by phone or email and type in the supplier reference.
- **Live API**: TBO or Hotelbeds through one adapter shape (`search → recheck → book → cancel`). **Mock adapters only in this phase.**

Results for the same hotel from several sources are **merged into one result showing the cheapest rate**, using supplier-code → hotel mapping.

## 3. Travelta v1: what exists (reference)

| Module | v1 evidence | v2 decision |
|---|---|---|
| Booking engine (hotels/tours/bus/flight/visa tabs; Extranet/B2B/Global filter) | `booking_engine*.blade.php`, `booking_engine_cart`, `bookingengine_*` tables | Keep the UX. Add merged live stock (mocked). |
| Manual booking wizard (To → From → Details → Cart) | `BookingController::add_manual_booking`, `mannual_bookings_cart` (279 refs) | Keep as the main back-office flow. |
| Extranet inventory | `hotels`, `rooms`, `roomtypes`, `room_prices`, `room_prices_nation`, `rooms_availabilities` (one route per month!), `supplement`, `tours*` (12 tables), `bus`, `flights` | Keep the concepts. Normalise availability by date. Add Umrah, Activities, Visas, Transfers. |
| Requests/CRM | `leads`, `request` (stages `pending → price_qoutation → negotiation`; status `won/lost`), work-station Kanban | Keep and polish. Fixed enums. |
| Booking ops | Upcoming / current / past; statuses `pending, confirmed, vouchered, completed, cancelled, missed` | Proper state machine with history. |
| Payments | `payments`, `booking_paid`, `ptc_amount`, `reserved_fund`, payment types full / partial / later; split collection across `financiales` accounts | Keep the rules. Back them with a ledger. |
| Invoices & refunds | `invoices`, `invoice_details`, `invoice_notes`, `service_cancellation` | Keep. Refund = credit note minus supplier fees. |
| Accounting | `expenses`, `revenues`, `*_category`, `transactions`, `general_ledger` view, `wallet_agency`, `recharge_wallet` | Rebuild as double-entry. |
| SaaS | `packages`, `agency_package`, `billing_record`, `stripe/paypal/paymob_payment` | Keep the idea. Tighter plans and limits. |
| Roles | `admins`, `admin_roles`, `admin_role_access` (per-module) | Keep the design: owner-defined roles from per-module permissions. |
| HRM, tasks, channel manager, support tickets, promo codes | Small controllers | **Out of scope** for the prototype, except promo codes (B2C checkout) and support (B2C help). See open questions. |

### v1 problems we design against
Free-text statuses (`reqhotel`, `1`, `approve`). The tenant filter is written by hand in every query. A 3.8k-line controller plus a near-copy. No migrations. Committed `.env`. "USD 0" rooms. Duplicate amenities. Raw HTML in names. The B2C route returns 404. English only, LTR only. No customer notifications.

## 4. Scope of this phase

**In scope (complete, nothing deferred; decision 15 Nov 2026):** a monorepo with a Next.js web app (Admin, Agency and Supplier portals, the Travelta Direct storefront, agency-branded storefronts) and a Travelta-branded Expo mobile app (B2C), covering all 7 services end to end. The business logic is fully simulated against an in-process **mock server** with seeded, persisted data, so every visible business action works.

**Out of scope:** NestJS, Postgres/Prisma implementation, HTTP calls, real supplier or payment gateways, real email/WhatsApp, real customer data.

## 5. Portals at a glance

| Portal | Users | Key workflows |
|---|---|---|
| Platform Admin | Super admin, Compliance/Ops | KYC review, org management, supplier service-line approval, platform markup, catalog/mapping, bookings oversight, platform ledger, plans and subscriptions, reports, settings |
| Agency | Owner, Sales, Operations, Accountant; Sub-agent (child org) | Search and book, manual booking wizard, booking board, CRM pipeline, customers, wallet/credit, payments and instalments, invoices/refunds, ledger, team and roles, reports, storefront settings |
| Supplier | Supplier admin and staff | Products and inventory (extranet), rates and availability, booking confirmations, payouts and statements, reports |
| B2C Storefront (web) + Mobile app | Customers | Discover, search, details, cart, checkout (simulated payment), confirmation, vouchers, booking history, cancellation, profile, notifications, support |

See `BUSINESS_WORKFLOWS.md` for flows, `BUSINESS_RULES.md` for rules, and `FRONTEND_ARCHITECTURE.md` for the route map.
