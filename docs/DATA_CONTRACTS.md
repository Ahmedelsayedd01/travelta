# Data Contracts

`@travelta/contracts` holds the framework-free vocabulary: enum tuples (`SERVICE_TYPES` …), error codes with HTTP statuses, response envelopes, and the **endpoint catalogue** the future NestJS API must implement. `@travelta/schemas` (Zod) builds on those tuples and is the source of truth for every DTO and form shape (types via `z.infer`). Dependency direction: `schemas → contracts → shared` (implemented in Milestone 2). Validation messages are i18n keys (`validation.*`), and a test checks they are translated in both locales. The mock server validates **inputs and outputs** against these schemas in dev, so contract drift fails fast.

## 1. Primitives
```ts
type Id<P extends string> = `${P}_${string}`;          // e.g. Id<'bk'> — prefixed ULID
type ISODate = string;      // 'YYYY-MM-DD' (service dates, no TZ)
type ISODateTime = string;  // UTC instant
type CurrencyCode = 'EGP' | 'USD' | 'SAR' | 'EUR';
interface Money { amountMinor: number; currency: CurrencyCode }   // integer, see MON-1
type Locale = 'en' | 'ar';
type LocalizedText = { en: string; ar: string };
```

## 2. Enums (fixed lists, no free text)
```ts
ServiceType      = 'hotel' | 'flight' | 'tour' | 'visa' | 'umrah' | 'activity' | 'transfer'
InventorySource  = 'extranet' | 'manual' | 'tbo' | 'hotelbeds'
OrgType          = 'platform' | 'agency' | 'supplier'
OrgStatus        = 'pending_kyc' | 'active' | 'suspended' | 'blocked_expired_docs' | 'rejected'
BookingItemStatus= 'pending' | 'confirmed' | 'vouchered' | 'travelled' | 'cancelled' | 'rejected' | 'no_show'
HoldReason       = 'awaiting_supplier' | 'awaiting_payment' | 'awaiting_credit_approval'
Channel          = 'b2c' | 'b2b' | 'manual'
PaymentType      = 'full' | 'partial' | 'later'
PaymentMethod    = 'cash' | 'bank_transfer' | 'card' | 'vodafone_cash' | 'instapay' | 'wallet'
PaymentStatus    = 'pending' | 'authorized' | 'succeeded' | 'failed' | 'voided' | 'refunded'
InstallmentStatus= 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'
RequestStage     = 'pending' | 'price_quotation' | 'negotiation' | 'won' | 'lost'
KycCaseStatus    = 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected'
KycDocType       = 'commercial_register' | 'tax_card' | 'tourism_license'
MarkupLayer      = 'platform' | 'agency' | 'sub_agent'
MarkupScope      = 'product' | 'destination' | 'nationality_group' | 'customer_group' | 'default'
MarkupMode       = 'percent' | 'fixed'
SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled'
```
Every enum has i18n labels in `@travelta/i18n` (`enums.bookingItemStatus.pending`).

## 3. Response models
```ts
// Success
interface ApiResult<T>  { data: T; meta?: { requestId: string } }
interface Page<T>       { items: T[]; page: number; pageSize: number; total: number }
// List query (shared by all list endpoints)
interface ListQuery { page?: number; pageSize?: number /*≤100*/; sort?: `${string}:${'asc'|'desc'}`; q?: string; filters?: Record<string, string | string[]> }
```

## 4. Error model
```ts
interface ApiError {
  code: ErrorCode;              // stable machine code
  message: string;              // English fallback; UI translates via `errors.<code>`
  details?: { field?: string; issue: string }[];   // Zod issues for VALIDATION_ERROR
  requestId: string;
  httpStatus: number;           // what the real API will return
}
ErrorCode =
  | 'VALIDATION_ERROR'(422) | 'UNAUTHENTICATED'(401) | 'FORBIDDEN'(403) | 'NOT_FOUND'(404) | 'CONFLICT'(409)
  | 'INVALID_TRANSITION'(409) | 'ORG_NOT_ELIGIBLE'(403) | 'PLAN_LIMIT_REACHED'(402)
  | 'INSUFFICIENT_FUNDS'(402) | 'PRICE_CHANGED'(409) | 'QUOTE_EXPIRED'(410) | 'SOLD_OUT'(409)
  | 'SUPPLIER_UNAVAILABLE'(503) | 'SUPPLIER_TIMEOUT'(504) | 'PAYMENT_DECLINED'(402) | 'INTERNAL'(500)
```
The api-client throws `ApiClientError` (with the `ApiError` attached). Hooks map codes to translated toasts or inline form errors.

## 5. Audience-specific DTOs (redaction by type)
```ts
interface PriceBreakdown.Platform { net; platformMarkup; agencyMarkup?; subAgentMarkup?; tax; sell; fx; appliedRuleIds }
interface PriceBreakdown.Agency   { agencyCost; agencyMarkup; subAgentMarkup?; tax; sell; fx }      // no net/platform split
interface PriceBreakdown.SubAgent { buyPrice; ownMarkup; tax; sell }
interface PriceBreakdown.Supplier { net }
interface PriceBreakdown.Customer { preTax; tax; discount?; total }
```
`BookingDto`, `BookingItemDto` and `SearchOfferDto` follow the same pattern. The stored, unredacted shape is `PriceBreakdown` in `PRICING_ENGINE.md §8`. These DTOs are projections of it.

## 6. Endpoint catalogue (documented, NOT implemented; the mock operations use the same names)
The api-client method ⇄ the future REST route. All routes are prefixed `/v1`; the tenant comes from the token, never the path.

| Area | api-client method | Future route |
|---|---|---|
| Auth | `auth.login`, `auth.register`, `auth.me`, `auth.switchOrg`, `auth.logout` | `POST /auth/login` … `POST /auth/switch-org` |
| Orgs | `orgs.list/get/update/suspend`, `orgs.createSubAgency` | `/organizations` |
| KYC | `kyc.getMyCase`, `kyc.uploadDocument`, `kyc.submit`, `kyc.queue`, `kyc.decide`, `kyc.approveServiceLine` | `/kyc/...` |
| Team | `users.list/invite/update/deactivate`, `roles.list/create/update`, `permissions.catalog` | `/users`, `/roles` |
| Catalog | `products.list/get/create/update/publish`, `inventory.getCalendar`, `inventory.bulkUpdate`, `mapping.*` | `/products`, `/inventory` |
| Search | `search.hotels/flights/tours/visas/umrah/activities/transfers`, `search.offerDetails` | `POST /search/{service}` |
| Pricing | `pricing.quote`, `pricing.simulate`, `pricing.rules.*` (incl. `versions`), `pricing.fees.*`, `pricing.taxProfiles.*`, `pricing.override`, `pricing.history`, `commercialSettings.get/update`, `promoCodes.*`, `fx.rates.*` | `/pricing/...`, `/commercial-settings`, `/fx/rates` |
| Storefronts | `storefronts.get/update/publish`, `storefronts.domains.add/verify`, `storefronts.resolveHost` | `/storefronts/...` |
| Cart | `cart.get/addItem/removeItem/recheck` | `/carts/{id}` |
| Checkout | `checkout.submit` (Idempotency-Key) | `POST /checkout` |
| Bookings | `bookings.list/get/confirmItem/rejectItem/issueVoucher/cancelPreview/cancel/addNote/history` | `/bookings/...` |
| Payments | `payments.plan.set`, `payments.collect`, `payments.list`, `payments.refund`, `installments.overdue` | `/payments`, `/installments` |
| Wallet | `wallet.get`, `wallet.transactions`, `wallet.requestTopUp`, `wallet.decideTopUp`, `wallet.setCreditLimit`, `wallet.approveOverLimit` | `/wallets/...` |
| Invoices | `invoices.list/get/updateAdjustments`, `creditNotes.list` | `/invoices` |
| Accounting | `ledger.accounts`, `ledger.entries`, `ledger.trialBalance`, `expenses.*`, `transfers.create`, `financialAccounts.*` | `/accounting/...` |
| Suppliers | `suppliers.list/get/update`, `suppliers.contracts.*`, `supplierPayables.*`, `supplier.reservations` | `/suppliers/...` |
| CRM | `leads.*`, `requests.*` (`moveStage`), `quotations.*`, `followUps.*`, `customers.*`, `notes.*` | `/crm/...`, `/customers` |
| SaaS | `plans.*`, `subscriptions.get/change/cancel`, `subscriptionInvoices.list` | `/plans`, `/subscriptions` |
| Reports | `reports.sales/revenue/profit/ageing/payables/agencyPerformance/supplierPerformance` | `GET /reports/{name}` |
| Notifications | `notifications.list/markRead`, `support.tickets.*` | `/notifications`, `/support` |
| Demo (mock only) | `demo.reset`, `demo.export`, `demo.import`, `demo.setClock`, `demo.setSupplierBehavior`, `demo.setLatency` | — (never in production) |

### Operations requiring server-side validation in production
**All writes.** Especially: pricing/quote, checkout, confirm/reject/cancel, collect payment, refund, wallet top-up decision, credit limit, over-limit approval, ledger/expenses, KYC decide, role/permission changes, subscription change, price override. The client never sends computed money values that the server trusts. It sends **intent** (product, dates, pax, quoteId), and the server recomputes.

## 7. Idempotency and concurrency (contract-level now, enforced later)
- `checkout.submit`, `payments.collect` and `wallet.decideTopUp` accept an `idempotencyKey`. The mock server honours it, so a double click can't double-book.
- Mutable aggregates carry `version`. Updates send `expectedVersion`, and a mismatch returns `CONFLICT`.
