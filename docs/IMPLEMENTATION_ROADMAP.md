# Implementation Roadmap (Stage B)

**Scope is fixed and complete** (decision 15 Nov 2026). Milestones set the build order; they don't cut scope. The prototype is finished only when every item in the *Definition of done* below is implemented and validated.

## Definition of done (applies to every feature)
- Every visible business action performs its simulated behaviour through the mock server. No decorative buttons.
- Forms use shared Zod schemas, with inline errors, disabled or loading submit, and success and error toasts.
- Lists support search, filters, sorting and pagination where relevant, plus skeleton, empty and error states.
- State transitions go through the domain state machines and are logged and audited.
- Permission- and tenant-checked. Redacted per audience.
- en + ar, RTL + LTR, light + dark, responsive (375 / 768 / 1280).
- Persists across reload and returns to the seed on reset.
- Rule tests exist (rule IDs) and the related E2E journey passes.

### Per-service completeness checklist (all 7 services must tick every column)
| Service | Search + filters | Details | Pricing (engine adapter) | Customer/traveller info | Booking | Supplier confirmation | Cancellation/refund | Documents |
|---|---|---|---|---|---|---|---|---|
| Hotels | dest, dates, rooms/ages, nationality; stars, meal, refundable, source, price | gallery, rooms, policies | room-nights, supplements, child rates | guest per room | ✓ | extranet/manual/TBO/Hotelbeds mocks | policy-based | hotel voucher |
| Flights | one-way/round, pax, cabin; stops, airline, times, baggage, price | itinerary, fare rules | fare per pax type + pass-through taxes | passports | ✓ | TBO mock + manual ticketing (PNR, ticket no.) | fare-rule fee | e-ticket itinerary |
| Tours | dest, date, pax types; duration, type, price | itinerary, inclusions/exclusions | per person type + extras | travellers | ✓ (seats) | extranet/manual | tour policy | tour voucher |
| Visas | country, nationality, travel date; type, processing time | requirements, documents list | fee per pax + embassy pass-through | passport + document uploads, appointment | ✓ | manual supplier status steps (submitted → in process → issued/refused) | refund rules before submission | visa application summary + issued visa (mock file) |
| Umrah | season, departure city, occupancy, pax | Makkah/Madinah hotels & nights, inclusions | per-occupancy + add-ons | travellers, mahram, group leader | ✓ | extranet/manual | package policy | Umrah voucher + group manifest |
| Activities | dest, date; category, duration, language, price | highlights, slots, pickup | per age band per slot | lead traveller, pickup | ✓ (slot capacity) | Hotelbeds mock + extranet | activity policy | e-ticket/voucher with QR (mock) |
| Buses & transfers | from/to, date, pax/vehicle; vehicle type, time | route, vehicle, seats | per seat / per vehicle | passengers, flight no. for airport transfers | ✓ | extranet/Hotelbeds-transfers mock; driver/bus no. by ops | transfer policy | transfer voucher / bus ticket |

## Milestones
Each milestone ends with: typecheck ✓, lint ✓, tests ✓, the affected workflows clicked through (en/ar, light/dark), persistence and reset checked, docs updated, and a report (built / tested / known gaps / decisions needed).

### Phase 1: Foundation
| # | Milestone | Deliverables |
|---|---|---|
| 1 | Monorepo foundation | pnpm + Turbo, shared tsconfig/eslint, `apps/web` (Next + Tailwind + next-intl), `apps/mobile` (Expo Router + i18next). **Compatibility gate:** `pnpm dev`, `next build`, and `expo export` for iOS and Android each run independently and pass. |
| 2 | Contracts, schemas, i18n, **design system** | Enums, Money, error/response models, core Zod schemas, ICU en/ar, design tokens with light and dark themes + contrast tests, web UI kit and mobile UI kit foundations (`DESIGN_SYSTEM.md`) |
| 3 | Mock data infrastructure | mock-server core (db, transactions, persistence per platform, latency, clock, events), api-client + MockTransport, deterministic seed framework, Demo panel (reset, clock, **export/import JSON**) |
| 4 | Auth simulation & RBAC | Demo accounts, login/register, sessions (SecureStore on mobile), org switcher, permission catalogue, role templates + custom roles, guards, redaction mappers |

### Phase 2: Tenancy and shell
| 5 | Organizations, agencies, suppliers | Org CRUD, sub-agencies, branches, supplier profiles and **contracts (commission)**, team & roles UI, tenant settings, **Commercial Settings (DEMO values)** |
| 6 | Portal layouts & navigation | Admin / Agency / Supplier shells, storefront shell, data-driven nav, DataTable kit, toasts, dialogs |
| 7 | KYC & documents | Sign-up step 2, uploads (local), review queue, decision log, expiry watcher, service-line approvals, eligibility blocking |

### Phase 3: Shared commerce core
| 8 | **Pricing engine** | Full `PRICING_ENGINE.md`: layers, specificity, guardrails, commission, fees, discounts/promo, tax profiles, FX, rounding, overrides, versioned rules, history; rule UIs; **pricing simulator**; breakdown panel |
| 9 | Catalog & inventory (all 7 services) | Product models + management UIs for every service; hotel create wizard; availability calendars/bulk edit; departures, slots, seats; mapping |
| 10 | Supplier adapters | Interface + extranet, manual, mock TBO (hotels, flights), mock Hotelbeds (hotels, activities, transfers); merge/cheapest; logs; behaviour overrides |
| 11 | Search & discovery (all 7) | Search forms, results, filters, sort, pagination, details pages for every service, priced per viewer |

### Phase 4: Transactions and money
| 12 | Cart & checkout | Server-side multi-service cart, quotes/recheck/price-change acceptance, per-service traveller forms, idempotent submit, **manual booking wizard** for all 7 services |
| 13 | Booking management | State machine incl. service-specific sub-steps (visa processing, flight ticketing), ops board, supplier confirm/reject (both portals), documents/vouchers for all 7, notes, history |
| 14 | Payments & instalments | Full/partial/later, plan editor, split collections, overdue board, simulated gateways + test cards, B2C authorise/capture |
| 15 | Wallet & credit | Wallets, holds, top-ups, credit limits, over-limit approvals, sub-agency funding |
| 16 | Invoices, refunds & accounting | Invoices/credit notes, chart of accounts, posting from finalized breakdown (commission, payouts), journal, trial balance, expenses, transfers, supplier payables & payouts, end-to-end cancellation/refund for all 7 services |

### Phase 5: Business management
| 17 | CRM | Leads, request Kanban, quotations (engine-priced), follow-ups, customer 360, won → booking |
| 18 | Subscriptions & SaaS | Plans (DEMO prices, editable), limits enforcement, upgrades/downgrades, billing history, renewals via clock |
| 19 | Notifications | Event → in-app notifications for all roles, email/WhatsApp outbox previews (templates en/ar), reminders (instalments, document expiry, upcoming travel) |
| 20 | Reports & analytics | Portal dashboards; sales, bookings, revenue/profit (ledger), margins per party, ageing, payables, agency/agent/supplier performance; CSV export |

### Phase 6: Customer channels and hardening
| 21 | B2C storefront (Travelta Direct) | Home, discovery, all 7 services, account, vouchers, customer cancellation, promo codes, support |
| 22 | Agency-branded storefronts | Storefront settings (logo, colours with contrast check, subdomain/custom domain with simulated verification), `/s/[slug]` + host mapping, agency B2C pricing, bookings tied to the agency tenant |
| 23 | Mobile app (Travelta) | All screens in `MOBILE_ARCHITECTURE.md` for all 7 services, local notifications, voucher share, export/import |
| 24 | Shared-rules integration audit | Boundary lint, no domain logic in app code, contract tests across apps |
| 25 | Testing & UX refinement | Full Playwright suite, a11y (axe), RTL and dark-mode visual pass, performance, final docs |

(The brief's 23 milestones are kept. Design system, notifications and branded storefronts are listed as their own rows for traceability.)

## Critical path
```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 20 → 21 → 22 → 23 → 24 → 25
                          17 after 12 · 18 after 5 · 19 after 13
```

## Checkpoints
I'll report after every milestone. Recommended review checkpoints where I pause for your feedback: after **4** (foundation + auth), **8** (pricing engine + simulator), **13** (bookings across all 7 services), **16** (financials), **22** (all web channels) and **23** (mobile).

## Status (16 Nov 2026)
All 25 milestones are implemented on mock data. Verification per milestone is summarised in `TESTING_STRATEGY.md` §6 and in `FINAL_REPORT.md`. Open item: run the mobile app on iOS/Android simulators (M23 is verified by typecheck, lint and the native bundle export only).
