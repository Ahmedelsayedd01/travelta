# Future Backend Architecture (NestJS). Reference only, NOT built in this phase

## 1. Shape
A **modular monolith** in NestJS with one REST API (`/v1`, OpenAPI) serving the back office, storefronts, supplier extranet and mobile app. No microservices.

```text
apps/api (future)
└── src/modules/
    auth · organizations · kyc · users-roles · catalog · inventory · supplier-connectivity (adapters)
    search · pricing · fx · cart · checkout · bookings · payments · wallet · invoices · accounting
    crm · customers · suppliers · subscriptions · reports · notifications · support · audit · files
```

Each module has controller → application service → domain (`@travelta/domain`, **the same package the prototype uses**) → Prisma repository.

## 2. What moves from the prototype
| Prototype piece | Becomes |
|---|---|
| `@travelta/contracts` + `@travelta/schemas` | Request/response DTOs (Zod → `nestjs-zod` pipes or class-validator generated), OpenAPI |
| `@travelta/domain` | Imported unchanged by services |
| `mock-server/services/*` | Reference implementation and behaviour spec for Nest services. Tests are ported as integration tests. |
| `mock-server/mappers/*` (redaction) | Response serializers / interceptors |
| `mock-server/adapters/suppliers/*` interface | Real `TboAdapter`, `HotelbedsAdapter` (HTTP, SHA-256 signing for Hotelbeds, content sync) |
| `mock-server/jobs/*` | BullMQ repeatable jobs |
| `mock-server/events` | Nest EventEmitter + outbox table → BullMQ |
| `api-client` MockTransport | HttpTransport (fetch, auth refresh, idempotency header) |

## 3. Infrastructure roles
| Component | Use |
|---|---|
| PostgreSQL | System of record. **Row-Level Security** on `tenant_id`, plus a Prisma client extension setting `app.tenant_id` per request. |
| Prisma | Schema from `DATABASE_DESIGN.md`. Versioned migrations reviewed in PRs (fixes v1's missing migrations). |
| Redis | Search result cache (TTL a few minutes, per proposal), quote store (15 min TTL), rate limiting, session/refresh-token denylist |
| BullMQ | Supplier book/cancel calls with retries, nightly hotel content sync, FX rate updates, document-expiry checks, instalment reminders, email/WhatsApp sending, subscription renewals |
| WebSockets (Nest Gateway) | Booking status pushes (pending → confirmed), ops board live updates, notification badge |
| Object storage | KYC docs, vouchers, invoices (signed URLs) |
| Payments | Paymob (EGP), Stripe/PayPal: webhooks → payment state, idempotency keys |
| Messaging | Email provider + WhatsApp Business API |
| Observability | Structured logs with requestId, error monitoring, audit log table |

## 4. Server-authoritative domains (the prototype only simulates these)
Authentication & authorization · tenant isolation · pricing & FX lock · supplier availability & recheck · booking confirmation · payment processing · financial transactions & wallet balances (row locks / serializable) · accounting postings · invoice numbering (DB sequences per tenant) · KYC decisions · audit logs · plan limits.

## 5. Integration plan, for when this phase ends
1. Freeze contracts v1 and generate the OpenAPI from the schemas.
2. Build Nest modules in order: auth/orgs → catalog/inventory → pricing → cart/checkout/bookings → payments/wallet/ledger → CRM → SaaS → reports.
3. Run the ported mock-server test suites against the API (contract tests).
4. Switch apps per feature with a transport flag (`NEXT_PUBLIC_API_MODE=mock|http`) so the switch can be gradual.
5. Write data-migration scripts from the v1 MySQL export (table map in `DATABASE_DESIGN.md`).
