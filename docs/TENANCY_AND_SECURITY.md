# Tenancy and Security

## 0. As built (Milestone 4)
- **Catalogue:** 61 permissions and 9 system role templates in `@travelta/contracts/permissions`. A test guarantees no template exceeds its organization type's scope and encodes the proposal's role boundaries. The seed gives every organization the templates for its type.
- **Request identity:** `MockServer.handle(op, input, token)` resolves a `Principal { session, user, org, role, permissions }` from the token alone, inside the operation queue. `auth: 'session'` operations without a valid token return 401. Handlers call `assertPermission(ctx, …)` (403) and read the tenant from `principal.org`, never from input.
- **Sessions:** an opaque random token, 7-day expiry on the demo clock, revoked on logout and on org switch (`auth.switchOrg` re-issues the session for another membership only). A demo reset wipes all sessions. Passwords use a **simulated** salted non-cryptographic hash (`sim1$…`).
- **Audiences:** `staff` (web portals) and `customer` (storefront and mobile) are separate. A staff account can't sign in as a customer and vice versa (403 with a specific UI message). Customers belong to their seller organization (`sellerTenantId`), so the same email can exist per storefront.
- **Audit:** login, registration and org switch are written to `auditLogs` inside the same transaction. `audit.list` is tenant-scoped, except that the platform's `audit.view` covers every tenant.
- **Web client:** the token and SessionDto are in a persisted Zustand store (localStorage, **prototype only**; production uses an httpOnly cookie). `PortalGuard` covers signed-in state, the correct portal, and live re-validation via `auth.me`. `RequirePermission` and `Can` gate routes and actions, and nav items carry their permission, so a hidden item is also a blocked URL.
- **Mobile client:** only the token is stored, in Expo SecureStore. User, organization and permissions are re-fetched on every launch.
- **Stale-session protection:** every failed request is tagged with the token it carried. The client signs out only when the *current* token is rejected, and `auth.me` responses only update the store if their token is still current. This prevents an in-flight request from a replaced session undoing a role or org switch.

## 1. Tenant model
- **Organization** is the tenant. `type ∈ {platform, agency, supplier}`. Sub-agencies are agency orgs with `parent_id`.
- A user can belong to several organizations through **Membership** and picks the active one with the org switcher. Each membership has exactly one role in that org.
- Customers (B2C) are `User(user_type=customer)` linked to a **Customer** record of the selling tenant: Travelta Direct (global storefront and mobile app) or the agency whose branded storefront they used. Every booking stores `sellerTenantId` + `storefrontId` + `channel`. Agencies see only bookings sold through their own storefront or portal. The platform sees all of them.

## 2. Two checks on every operation
Every mock-server operation receives a `RequestContext { userId, tenantId, tenantType, permissions[], channel }` built from the session token, **never from parameters the UI passes**. Each service then:
1. **Tenant check**: the repository applies `tenant_id = ctx.tenantId` automatically through a scoped repository factory, so services can't forget it. This fixes v1's hand-written filters. The platform role gets an explicit `crossTenant` scope only on admin operations.
2. **Permission check**: `assertPermission(ctx, 'bookings.create')`. Missing → `403 FORBIDDEN` error envelope.

## 3. Permission catalogue (excerpt)
Format `module.action`. Owners build custom roles from these, like v1's `admin_role_access`.

| Module | Actions |
|---|---|
| bookings | view, create, update_details, confirm, voucher, cancel, view_cost |
| pricing | view, manage_rules, override_markup, override_price, override_guardrails (platform), discount, simulate |
| commercial_settings | view, manage (platform) |
| storefront | view, manage |
| payments | view, collect, refund_request, refund_approve |
| wallet | view, top_up_request, top_up_approve (platform/parent), credit_manage |
| invoices | view, issue, void |
| accounting | view, post_manual_entry, manage_accounts |
| crm | view, manage_own, manage_all |
| customers | view, manage |
| inventory | view, manage |
| suppliers | view, manage |
| team | view, manage_users, manage_roles |
| kyc | view_own, submit, review (platform) |
| subscriptions | view, manage |
| reports | view, view_financial |
| settings | manage |

### System role templates (seeded; agency owners can clone and edit)
| Role | Level | Highlights | Explicitly denied |
|---|---|---|---|
| super_admin | platform | all | — |
| compliance_ops | platform | kyc.review, organizations, credit_manage, disputes, bookings.view | subscriptions.manage, supplier connection keys |
| agency_owner | agency | all agency permissions | other tenants |
| sales_agent | agency | crm.manage_own, bookings.create/view (own customers), quotations | pricing.override_price, bookings.view_cost (configurable), payments.refund_approve |
| operations | agency | bookings.confirm/voucher, board | price changes after confirmation |
| accountant | agency | payments.*, invoices.*, accounting.*, supplier payables | bookings.create |
| sub_agent_owner | sub-agency | bookings.create at B2B price, own wallet, own customers, own markup layer | parent cost/markup |
| supplier_admin / supplier_staff | supplier | inventory.*, bookings.confirm (their items), finance statement | sell price, customer contact details |
| customer | public | own bookings, vouchers, profile, support | — |

## 4. Field-level redaction (server-side responsibility)
Cost and markup fields are removed **in the mock-server response mappers**, not hidden in components. That way the UI can't leak them and the future API keeps the same contract.

| Viewer | Sees | Never receives |
|---|---|---|
| Platform | everything | — |
| Agency (with `bookings.view_cost`) | agency cost (= net + platform markup as one figure), own markup, sell | supplier net, platform markup |
| Agency (without view_cost) | sell price | cost, markups |
| Sub-agent | their buy price (agency's B2B price), own markup, sell | agency cost and markup |
| Supplier | net rate, their items, traveller names needed for service | sell price, markups, customer phone and email |
| Customer | final price and tax breakdown | anything else |

DTOs are separate types per audience (`BookingDto.Agency`, `BookingDto.Supplier`, `BookingDto.Customer`) so the type system enforces the redaction.

## 5. Booking-blocking rules (security-relevant)
- Org `status ≠ active` (KYC not approved, suspended, or **any required document expired**) → `bookings.create`, `cart.checkout` and supplier stock going live are refused with `ORG_NOT_ELIGIBLE`.
- A supplier's product is visible only if its service line is approved **and** the product is approved/live.

## 6. Audit
Every state change (status transitions, price overrides, KYC decisions, refunds, wallet approvals, role changes) writes `AuditLog { actor, tenant, action, entity, before, after, at }`. Admins can view it, and each entity's detail page shows its own audit trail.

## 7. What is simulation-only (must move server-side)
| Concern | Prototype | Production |
|---|---|---|
| Authentication | Demo accounts, password check in mock, opaque token in storage | NestJS auth, hashed passwords, short-lived JWT + refresh, MFA for platform/finance roles |
| Tenant isolation | Scoped repositories in browser | Prisma middleware/extension **plus Postgres Row-Level Security** |
| Permissions | Evaluated in mock-server | Guards on every endpoint. The client copy is only for UX. |
| Redaction | Response mappers in mock | Same mappers in API serializers |
| Pricing, FX, tax | `domain` in browser | Same `domain` package run in API. Client values are ignored. |
| Payments | Test cards | Paymob/Stripe/PayPal with webhooks and idempotency keys |
| Wallet/ledger | IndexedDB | Postgres transactions, `SERIALIZABLE` or row locks on wallet |
| Files (KYC docs) | Data-URL/blob in IndexedDB, size-limited | Private object storage, signed URLs, AV scan |
| Supplier credentials | Not present | Vault/secret manager. Never stored per agency (proposal rule). |

Anyone with devtools can tamper with the prototype. That's acceptable because it isn't a security boundary. Demo builds show a banner saying so.

## 8. Data protection
No real customer or financial data. Seeds use fictional names, `example.com` emails, and invalid-format passport numbers (`DEMO…`). Passport data is masked in lists (`DEMO••••12`).
