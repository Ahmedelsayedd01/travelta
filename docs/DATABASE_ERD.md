# Database ERD (future. Reference only)

Split into domains for readability. Mermaid renders on GitHub and in most Markdown viewers.

## Tenancy, access, KYC

```mermaid
erDiagram
  ORGANIZATION ||--o{ ORGANIZATION : "parent of (sub-agency)"
  ORGANIZATION ||--o{ BRANCH : has
  ORGANIZATION ||--o{ MEMBERSHIP : employs
  USER ||--o{ MEMBERSHIP : holds
  ROLE ||--o{ MEMBERSHIP : grants
  ORGANIZATION ||--o{ ROLE : defines
  ROLE ||--o{ ROLE_PERMISSION : includes
  ORGANIZATION ||--|| TENANT_SETTINGS : configures
  ORGANIZATION ||--o{ KYC_CASE : submits
  KYC_CASE ||--o{ KYC_DOCUMENT : contains
  KYC_CASE ||--o{ KYC_DECISION : logs
  ORGANIZATION ||--o{ SUPPLIER_SERVICE_LINE_APPROVAL : "requests (supplier)"
  ORGANIZATION ||--o{ SUBSCRIPTION : "subscribes (agency)"
  PLAN ||--o{ SUBSCRIPTION : priced_by
  SUBSCRIPTION ||--o{ SUBSCRIPTION_INVOICE : bills
  ORGANIZATION ||--o{ AUDIT_LOG : scopes
```

## Catalog and pricing

```mermaid
erDiagram
  ORGANIZATION ||--o{ PRODUCT : owns
  PRODUCT ||--o| HOTEL : "is a"
  PRODUCT ||--o| TOUR : "is a"
  PRODUCT ||--o| VISA_PRODUCT : "is a"
  PRODUCT ||--o| UMRAH_PACKAGE : "is a"
  PRODUCT ||--o| ACTIVITY : "is a"
  PRODUCT ||--o| TRANSFER_ROUTE : "is a"
  HOTEL ||--o{ ROOM_TYPE : has
  ROOM_TYPE ||--o{ RATE_PLAN : sold_as
  RATE_PLAN ||--o{ DAILY_RATE : "priced per date"
  RATE_PLAN }o--|| CANCELLATION_POLICY : follows
  HOTEL ||--o{ SUPPLEMENT : offers
  TOUR ||--o{ TOUR_DEPARTURE : runs
  ACTIVITY ||--o{ ACTIVITY_SLOT : runs
  UMRAH_PACKAGE }o--|| HOTEL : "makkah hotel"
  UMRAH_PACKAGE }o--|| HOTEL : "madinah hotel"
  PRODUCT ||--o{ SUPPLIER_PRODUCT_MAPPING : "mapped from provider codes"
  DESTINATION ||--o{ PRODUCT : locates
  ORGANIZATION ||--o{ MARKUP_RULE : "sets (platform/agency/sub-agent layer)"
  NATIONALITY_GROUP ||--o{ MARKUP_RULE : scopes
  CUSTOMER_GROUP ||--o{ MARKUP_RULE : scopes
  CURRENCY ||--o{ EXCHANGE_RATE : quotes
```

## Sales, bookings, money

```mermaid
erDiagram
  ORGANIZATION ||--o{ CUSTOMER : "sells to"
  ORGANIZATION ||--o{ LEAD : captures
  LEAD ||--o{ REQUEST : raises
  REQUEST ||--o{ QUOTATION : "priced by"
  REQUEST |o--o| BOOKING : "won → becomes"
  CART ||--o{ CART_ITEM : holds
  CART_ITEM }o--|| PRICE_QUOTE : "locked by"
  CART |o--o| BOOKING : "checks out to"
  CUSTOMER ||--o{ BOOKING : books
  BOOKING ||--|{ BOOKING_ITEM : contains
  BOOKING ||--o{ BOOKING_STATUS_HISTORY : logs
  BOOKING_ITEM }o--|| ORGANIZATION : "supplied by"
  BOOKING_ITEM ||--o| VOUCHER : issues
  BOOKING_ITEM ||--o{ SUPPLIER_REQUEST_LOG : traces
  BOOKING ||--o{ CANCELLATION : may_have
  BOOKING ||--o| PAYMENT_PLAN : "paid via"
  PAYMENT_PLAN ||--|{ INSTALLMENT : schedules
  BOOKING ||--o| INVOICE : "invoiced at confirmation"
  INVOICE ||--o{ CREDIT_NOTE : "refunded by"
  INVOICE ||--o{ PAYMENT : "settled by"
  PAYMENT ||--|{ PAYMENT_ALLOCATION : "split across"
  PAYMENT_ALLOCATION }o--|| FINANCIAL_ACCOUNT : into
  BOOKING_ITEM ||--o| SUPPLIER_PAYABLE : owes
  ORGANIZATION ||--o{ WALLET : "holds (agency)"
  WALLET ||--o{ WALLET_TRANSACTION : records
  WALLET ||--o{ TOP_UP_REQUEST : funded_by
  JOURNAL_ENTRY ||--|{ JOURNAL_LINE : "balanced lines"
  JOURNAL_LINE }o--|| LEDGER_ACCOUNT : posts_to
  FINANCIAL_ACCOUNT }o--|| LEDGER_ACCOUNT : "maps to"
  PAYMENT ||--o| JOURNAL_ENTRY : posts
  WALLET_TRANSACTION ||--|| JOURNAL_ENTRY : posts
  BOOKING ||--o{ JOURNAL_ENTRY : posts
```
