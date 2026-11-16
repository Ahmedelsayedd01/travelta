# Database Design (future PostgreSQL. Reference only, not implemented this phase)

The mock server's collections mirror these entities one-to-one, so swapping to Prisma later doesn't change any contract. Conventions:
- IDs: prefixed ULIDs as text (`org_…`, `bk_…`, `je_…`). They sort by time and are safe to generate on the client in the prototype.
- Every tenant-owned row has `tenant_id` (the owning organization). Shared reference data has none.
- Money: `amount_minor BIGINT` + `currency CHAR(3)`. No floats.
- Timestamps: `created_at`, `updated_at` (UTC). Soft delete (`deleted_at`) for master data only. Financial rows are **never** deleted or updated; corrections are reversing entries.
- Enums are fixed lists (see `DATA_CONTRACTS.md`). No free-text statuses.
- v1 equivalents are listed so migration scripts can be planned.

## 1. Identity, tenancy, access
| Entity | Key fields | v1 equivalent |
|---|---|---|
| Organization | id, type (`platform/agency/supplier`), parent_id (sub-agency → agency), name_en/ar, slug, country, base_currency, status (`pending_kyc/active/suspended/blocked_expired_docs`), kyc_status | travel_agency, suppliers, owners |
| Branch | id, tenant_id, name, city, address, phone | — |
| User | id, email, phone, name, locale, password_hash (future), status, user_type (`staff/customer`) | users, admins, employees |
| Membership | user_id, tenant_id, branch_id?, role_id, status | admins.agency_id |
| Role | id, tenant_id (null = system template), key, name, is_system | admin_roles |
| RolePermission | role_id, permission_key | admin_role_access |
| Permission (catalogue, static) | key `module.action`, scope (`platform/agency/supplier`) | — |
| StorefrontConfig | id, tenant_id, slug, name, logo/favicon refs, brand_primary, brand_accent, hero, contact, enabled services, languages, default currency, pay_later, status (`draft/published`) | — (new) |
| StorefrontDomain | storefront_id, host (subdomain or custom), verification_status (`pending/verified/failed`, simulated) | — |
| TenantSettings | tenant_id, default_markup_mode, tax defaults, branding (logo, colours), storefront domain/slug, notification prefs, payment methods enabled | layout, company_detail |
| AuditLog | id, tenant_id, actor_user_id, action, entity, entity_id, before, after, at, ip (future) | — (new) |

## 2. Compliance (KYC)
| Entity | Key fields |
|---|---|
| KycCase | id, tenant_id, status (`draft/submitted/in_review/changes_requested/approved/rejected`), submitted_at |
| KycDocument | id, case_id, tenant_id, doc_type (`commercial_register/tax_card/tourism_license/owner_id/other`), number, issue_date, expiry_date, file_ref, status (`pending/accepted/rejected/expired`), version |
| KycDecision | id, case_id, decision (`approve/reject/request_changes`), reason, decided_by, decided_at |
| SupplierServiceLineApproval | supplier_id, service_type, status (`requested/approved/rejected`), decided_by, decided_at |

## 3. Reference data
Country, City, Destination (city/region grouping), Nationality, NationalityGroup (+members), CustomerGroup, Currency, ExchangeRate (base, quote, rate, effective_at, source), Airport, Language, Amenity, MealPlan (`RO/BB/HB/FB/AI`).

## 4. Suppliers and catalog
| Entity | Key fields | v1 |
|---|---|---|
| SupplierProfile | org_id, legal name, contacts, service_types[], settlement currency, payment terms, commission_pct | suppliers, supplier_contact, supplier_services |
| SupplierContract | id, supplier_id, owner_tenant_id (platform for network suppliers, agency for own suppliers), valid_from/to, commission rules (per service / product, %), payout terms (days after service), credit/deposit terms, file_ref, status, is_demo_value | — |
| SupplierConnection | id, supplier_id, provider (`extranet/manual/tbo/hotelbeds`), mode (`sandbox/live`), status (credentials **server-only**, never in contracts) | — |
| Product (supertype) | id, owner_tenant_id, service_type, name_en/ar, destination_id, status (`draft/pending_approval/live/paused`), source | — |
| Hotel | product_id, stars, address, geo, amenities[], gallery[], check-in/out times, hotel_type | hotels, hotel_gallery, hotel_amenities |
| RoomType | id, hotel_id, name, max_adults, max_children, max_occupancy, amenities, gallery | rooms, roomtypes, room_gallery |
| RatePlan | id, room_type_id, supplier_id, meal_plan, currency, refundable, cancellation_policy_id, min_stay, nationality_group_id? | room_prices, room_prices_nation |
| DailyRate | rate_plan_id, date, net_minor, child_net_minor, allotment, sold, stop_sell | rooms_availabilities (12 month routes) |
| Supplement | id, hotel_id, name, type (`per_night/per_stay/per_person`), net_minor, mandatory | supplement, extras_assign |
| CancellationPolicy | id, rules[] `{ days_before, fee_type: percent/fixed/nights, value }`, non_refundable | service_cancellation, tour_cancelpolicy, room_chargeable_policy |
| Tour | product_id, type (`day/multi_day`), duration, itinerary[], inclusions[], exclusions[], transport, hotels (multi-day), opening_hours | tours, tour_* (12 tables) |
| TourDeparture | id, tour_id, date, seats_total, seats_sold, person_type_prices `{adult, child, infant}` | tour_dates, tour_persontype_price |
| FlightOffer (manual/TBO) | id, carrier, flight_no, from, to, depart_at, arrive_at, cabin, baggage, fares by pax type, seats | flights, bookingengine_flights |
| VisaProduct | product_id, country, visa_type, processing_days, validity, required_docs[], fee by pax type | — |
| UmrahPackage | product_id, season, makkah_hotel_id + nights, madinah_hotel_id + nights, transport, flight_included, visa_included, room occupancy prices (double/triple/quad), departures[] | — (new) |
| Activity | product_id, duration, highlights, languages[], age_bands, pickup_points[], old_price (strike), tags | tickets |
| ActivitySlot | activity_id, date, time, capacity, sold | — |
| TransferRoute / BusTrip | id, from, to, vehicle_type, depart_at, arrive_at, bus_number, driver, seats_total, seats_sold, price per seat/vehicle | bus, busses, buss_tickets |
| SupplierProductMapping | provider, provider_code, product_id, room_type_id? | — (new; merge TBO/Hotelbeds/extranet) |

## 5. Pricing
| Entity | Key fields | v1 |
|---|---|---|
| MarkupRule (+ MarkupRuleVersion) | id, version, owner_tenant_id, layer (`platform/agency/sub_agent`), match criteria (service types, sources, supplier ids, target agency ids, product ids, destination ids, nationality groups, customer types, channel, booking/travel windows), mode (`percent/fixed`), value, fixed currency + per (`unit/booking`), min/max amount, priority, status, is_demo_value | markup_control, hotel_markup, b2b_markup |
| CommercialSettings | tenant_id, default markups per layer/service/source, guardrails (agency & sub-agency min/max), fx_buffer_pct, rounding (mode, increment, charm) per currency, max discount % per role, default credit limit, is_demo_value flags per field | — (new) |
| FeeRule | owner_tenant_id, name, service types, mode, value, per (`unit/booking`), taxable, channel | tour_servicefees |
| TaxProfile | tenant_id, name, rate_bp, inclusive, base (`full_price/margin`) | taxes, room_taxes |
| PriceBreakdown | id, version, engine_version, owner (quote/cart item/booking item), currency, fx snapshot, lines JSON, totals, settlement, margins, finalized_at | — (new) |
| PricingLog | id, tenant_id, viewer, request_hash, breakdown_id, at | — (new) |
| TaxRule | id, tenant_id, service_type, name, rate_bp, inclusive (bool) | taxes, room_taxes, taxe_exception |
| PriceQuote | id, tenant_id, product_ref, params hash, components (net, markups[], tax), currency, fx_snapshot, expires_at | — (new) |
| PromoCode | id, tenant_id, code, type, value, limits, valid dates | promo_codes |

## 6. Customers & CRM
Customer (tenant_id, type `individual/corporate/sub_agent_org`, name, phone, whatsapp, email, nationality, customer_group_id, source, tags) · Traveller (customer_id?, title, first/last, dob, passport_no, passport_expiry, nationality) · Lead (tenant_id, name, contacts, source_id, owner_user_id, status `new/contacted/qualified/converted/lost`) · Request (tenant_id, lead/customer_id, service_type, destination, dates, pax, priority `low/medium/high`, expected_revenue, stage `pending/price_quotation/negotiation/won/lost`, assignee, lost_reason, booking_id) · Quotation (request_id, items, total, valid_until, status) · FollowUp (entity, due_at, type `call/whatsapp/email/meeting`, done_at, assignee) · Note / ActivityLog (polymorphic). v1: leads, leads_list, request, source, send_action.

## 7. Cart & bookings
| Entity | Key fields | v1 |
|---|---|---|
| Cart | id, tenant_id (seller), channel, customer_ref, created_by, currency, status (`open/checked_out/abandoned`) | booking_engine_cart, mannual_bookings_cart |
| CartItem | id, cart_id, service_type, source, product_ref, details (typed JSON per service), quote_id | — |
| Booking | id, ref (`TRV-YYMM-XXXXX`), seller_tenant_id, buyer (`customer_id` or `sub_agency_id`), channel (`b2c/b2b/manual`), created_by, status, payment_status, currency, fx_snapshot, totals (net, markups, tax, sell, discount, fees), invoice_id, notes | mannual_bookings, booking_engine |
| BookingItem | id, booking_id, service_type, supplier_id, source, product_ref, details JSON, travellers[], price components, cancellation_policy snapshot, supplier_ref, status, voucher_id | — |
| BookingStatusHistory | booking_id, item_id?, from, to, reason, actor, at | — (new) |
| Voucher | id, booking_item_id, number, issued_at, payload snapshot | voucher views |
| Cancellation | id, booking_id/item_id, requested_by, reason, supplier_fee, platform_fee, refund_amount, status (`requested/approved/rejected/completed`) | service_cancellation |
| SupplierRequestLog | id, booking_item_id, provider, operation (`search/recheck/book/cancel`), request, response, latency, outcome | — (new) |

## 8. Payments, wallet, invoices
| Entity | Key fields | v1 |
|---|---|---|
| PaymentPlan | booking_id, type (`full/partial/later`) | payments.payment_type |
| Installment | plan_id, seq, amount, due_date, paid_amount, status (`pending/partially_paid/paid/overdue/cancelled`) | payments (due dates), booking_paid |
| Payment | id, tenant_id, booking_id?, invoice_id?, payer, method (`cash/bank_transfer/card/vodafone_cash/wallet/instapay`), gateway (`none/paymob/stripe/paypal`, simulated), amount, status (`pending/succeeded/failed/refunded`), reference | payments, ptc_amount |
| PaymentAllocation | payment_id, financial_account_id, amount (split collection) | pay_and_collect, financiales |
| Refund | id, payment_id/cancellation_id, amount, method, status | — |
| Wallet | id, tenant_id (agency/sub-agency), held_at_tenant_id (platform or parent agency), currency, balance (derived/cached), credit_limit, credit_used | wallet_agency |
| WalletTransaction | wallet_id, type (`top_up/booking_debit/refund_credit/adjustment/credit_repayment`), amount, booking_id?, journal_entry_id | — |
| TopUpRequest | wallet_id, amount, method, proof file_ref, status (`pending/approved/rejected`), decided_by | recharge_wallet |
| Invoice | id, tenant_id, number (per-tenant sequence), booking_id, bill_to, lines, discount, extra_fees, tax, total, status (`issued/partially_paid/paid/void`), notes | invoices, invoice_details, invoice_notes |
| CreditNote | id, invoice_id, cancellation_id, lines, fees_deducted, total | refund invoice |
| SupplierPayable | booking_item_id, supplier_id, amount_due, amount_paid, due_date, status | supplier_payments, payable views |

## 9. Accounting (double-entry, per tenant)
| Entity | Key fields |
|---|---|
| LedgerAccount | id, tenant_id, code, name, type (`asset/liability/equity/revenue/expense`), parent_id, system_key (`ar`, `ap_supplier`, `wallet_liability` …) |
| FinancialAccount | id, tenant_id, kind (`cash/bank/vodafone_cash/card_gateway`), ledger_account_id, currency |
| JournalEntry | id, tenant_id, date, memo, source (`booking/payment/refund/expense/top_up/transfer/adjustment`), source_id, posted_by, reversal_of? |
| JournalLine | entry_id, ledger_account_id, debit_minor, credit_minor, currency, fx_rate, party (customer/supplier/agency)? |
| Expense / OtherRevenue | tenant_id, category_id, amount, financial_account_id, journal_entry_id |
| Transfer | from/to financial_account, amount, journal_entry_id |

Invariant: for each entry, `Σdebit = Σcredit` in the entry currency.

## 10. SaaS
Plan (key, name, price monthly/yearly, currency, limits `{users, branches, bookings_per_month, storefront}`, features[]) · Subscription (tenant_id, plan_id, status `trialing/active/past_due/cancelled/expired`, period_start/end, cancel_at_period_end) · SubscriptionInvoice (subscription_id, amount, status, paid_at). v1: packages, agency_package, billing_record.

## 11. Notifications & support
Notification (recipient user_id, channel `in_app/email/whatsapp/push`, template_key, payload, status `queued/sent/failed/read`, simulated=true) · NotificationTemplate (tenant_id?, key, locale, channel, body) · SupportTicket (customer/user, subject, status `open/pending/closed`, messages[]). v1: tickets, ticket_messages.

## 12. Indexes (future)
`(tenant_id, status, created_at)` on bookings, requests and payments; `(rate_plan_id, date)` unique on DailyRate; `(provider, provider_code)` unique on mapping; `(tenant_id, number)` unique on invoices; `(due_date, status)` on installments; `(expiry_date)` on KycDocument.
