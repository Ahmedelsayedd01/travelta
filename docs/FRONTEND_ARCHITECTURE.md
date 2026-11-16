# Web Frontend Architecture: `apps/web`

## 1. Layers (Clean Architecture applied to the frontend)

```text
UI (app/ routes, layouts, feature components)
   │  uses
Feature hooks (useBookings, useCreateBooking …: TanStack Query wrappers, no business maths)
   │  call
api-client (typed operations, Transport-agnostic)
   │  via MockTransport (now) / HttpTransport (future)
mock-server services (authoritative simulation) ──► domain rules ──► repositories ──► persistence (IndexedDB)
```

Rules:
- Components render and collect input. They don't compute prices, balances or status transitions.
- Hooks own query keys, invalidation and toasts. They don't contain rules.
- Business rules are in `@travelta/domain`. Data rules (tenant scope, redaction) are in `@travelta/mock-server`.

## 2. Folder structure

```text
apps/web/src/
├── app/
│   └── [locale]/
│       ├── (storefront)/                 # B2C, public chrome
│       │   ├── page.tsx                  # Home
│       │   ├── search/[service]/page.tsx
│       │   ├── [service]/[productId]/page.tsx
│       │   ├── cart/ checkout/ confirmation/[ref]/
│       │   └── account/(bookings|bookings/[ref]|vouchers|profile|notifications|support)
│       ├── s/[storefront]/…              # Agency-branded storefront (same pages, tenant-scoped; add-on)
│       ├── (auth)/login | register | register/business (KYC step 2) | forgot-password
│       ├── admin/…                       # Platform portal
│       ├── agency/…                      # Agency + sub-agency portal
│       └── supplier/…                    # Supplier portal
├── features/                             # One folder per business capability
│   ├── auth/  organizations/  kyc/  users-roles/
│   ├── catalog/  inventory/  search/  pricing/
│   ├── cart/  checkout/  bookings/  vouchers/  cancellations/
│   ├── payments/  wallet/  invoices/  accounting/
│   ├── crm/  customers/  suppliers/  subscriptions/  reports/  notifications/  settings/
│   └── <feature>/
│       ├── components/     # feature UI (BookingBoard, PriceBreakdownCard …)
│       ├── hooks/          # TanStack Query hooks + query keys
│       ├── forms/          # RHF forms bound to @travelta/schemas
│       ├── columns/        # TanStack Table column defs
│       └── utils/          # view-only helpers (formatting, mapping to badges)
├── components/
│   ├── ui/                 # Button, Input, Select, Dialog, Sheet, Table, Badge, Tabs, Skeleton, Toast, DatePicker, Combobox …
│   ├── data/               # DataTable (server-style pagination), FilterBar, EmptyState, ErrorState, StatCard, Money, StatusBadge
│   └── feedback/           # ConfirmDialog, PermissionGate, SimulationBadge
├── layouts/                # PortalShell (sidebar+topbar), StorefrontShell, AuthShell
├── hooks/                  # useSession, usePermission, useLocaleDir, useCurrency
├── lib/                    # api (client instance), query-client, i18n config, nav config per portal
└── styles/                 # globals.css (tokens → Tailwind @theme)
```

The prompt's per-feature `services/` and `repositories/` folders are replaced by `@travelta/api-client` and `@travelta/mock-server` so web and mobile share one implementation. See `MONOREPO_ARCHITECTURE.md`.

## 3. Portal route map

**Admin** (`/[locale]/admin`): dashboard · organizations (agencies, sub-agencies, suppliers) · kyc (queue, review/[id]) · users · roles · suppliers (profiles, contracts, service-line approvals, API connections) · catalog (products, mapping) · inventory · bookings (list, [ref]) · pricing (platform markup rules, tax rules, exchange rates) · finance (wallet top-up approvals, credit limits, supplier payables) · accounting (chart of accounts, journal, trial balance) · subscriptions (plans, agency subscriptions, billing) · reports · settings (platform, currencies, notification templates) · audit-log.

**Agency** (`/[locale]/agency`): dashboard · search (all 7 services) · manual-booking (wizard) · cart · bookings (board, list, [ref]) · customers · crm (leads, requests pipeline/Kanban, follow-ups) · sub-agents · wallet (balance, top-up, credit) · payments (collections, instalments, overdue board) · invoices (+ refunds) · suppliers (agency's own manual suppliers + payables) · accounting (ledger, expenses, revenues, accounts) · pricing (agency markup rules) · reports · team (users, roles) · subscription · storefront settings · kyc (company documents) · settings.

**Supplier** (`/[locale]/supplier`): dashboard · products (by approved service line) · inventory (availability calendar, allotments, stop-sell) · rates (net rates, by nationality, supplements, cancellation policies) · reservations (to confirm/reject; enter confirmation no.) · bookings history · finance (statement, payouts, commission) · reports · kyc · team · settings.

**Navigation is data-driven**: `lib/nav/<portal>.ts` declares items with a `permission` key. The `PortalShell` filters items through `usePermission`. Route-level guards in each portal layout redirect when the role or tenant type doesn't match.

## 3a. Storefronts (decision Q7)
| Storefront | URL (prototype) | Seller tenant | Pricing |
|---|---|---|---|
| Travelta Direct (global) | `/[locale]/…` | Platform retail org | Platform layer + Travelta Direct B2C rules |
| Agency-branded | `/[locale]/s/[slug]/…`; host mapping (`nile.travelta.app` or a custom domain → slug) is simulated through a `StorefrontDomain` table and a Demo-panel "open as host" switch | The agency | Platform layer (API/network stock) + that agency's B2C rules |

- `StorefrontConfig` (agency settings → Storefront): name, logo, favicon, brand primary/accent (contrast-checked, see `DESIGN_SYSTEM.md §3`), hero images, contact, enabled services, languages, default currency, pay-later toggle, subdomain, custom domain + simulated DNS verification status, publish/unpublish.
- Requires the plan's storefront add-on (SUB-3) and an active KYC status.
- Customer accounts are per seller tenant. Every cart and booking stores `sellerTenantId` and `storefrontId`, so bookings appear in the right agency's portal, invoices and ledger.

## 4. Rendering strategy
- The mock DB lives in the browser (IndexedDB), so data screens are **client components** wrapped in server-component layouts. Static marketing parts of the storefront can be server-rendered.
- When the HTTP backend arrives, list and detail pages can move to server fetching gradually. The hooks keep the same signatures.
- A boot gate (`<MockServerProvider>`) hydrates the DB from IndexedDB, or seeds it, before rendering the portals, with a skeleton in the meantime.

## 5. State
| Kind | Where |
|---|---|
| Server-like data (bookings, wallets …) | TanStack Query (keys: `[tenantId, resource, params]`) |
| Session (user, active org, permissions), locale, display currency | Zustand (persisted) |
| Cart | Server-side in the mock (cart entity), so prices are revalidated. A Zustand mirror only holds the cart id. |
| Form drafts (manual booking wizard) | RHF + Zustand persisted draft |
| UI prefs (sidebar collapsed, table density, last filters) | Zustand, localStorage |

## 6. Design system
The full specification is in `DESIGN_SYSTEM.md`: the approved teal/navy palette, light and dark themes, measured AA contrast, typography (Inter / IBM Plex Sans Arabic), spacing, radii, shadows and the component catalogue. In short:
- All portals share one shell: navy sidebar and teal primary actions. Portals are told apart by label, not colour.
- Tokens only. Raw hex values in components fail lint.
- RTL: logical Tailwind utilities only (`ms-`, `pe-`, `start-`, `text-start`). Directional icons are mirrored.
- Every data view has Skeleton → Empty → Error → Data. Destructive actions use `ConfirmDialog`. Results show toasts.
- `SimulationBadge` marks server-side or external actions. The `DEMO` badge marks commercial values that haven't been approved.

## 7. Dev tools (prototype only)
A floating **Demo panel**, shown only in dev and demo builds:
- switch the demo user/role in one click
- reset the data to the seed
- move the "today" clock (to test overdue instalments and document expiry)
- force the next supplier response (`confirm | reject | price_changed | timeout`)
- set latency and error rate.
