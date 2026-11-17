# Business lifecycle results

Cross-role workflows, run in the browser against the production build. After each important action, the result is read **from the other role's screens**, not from the success message. Status is from the final run on 17 Nov 2026 (see `E2E_TEST_RESULTS.md`).

## Workflows

| # | Workflow | Roles | Steps verified | Spec | Result |
|---|---|---|---|---|---|
| L1 | Hotel, B2C, confirmed then cancelled | Customer → supplier → customer → platform admin → customer → supplier → platform | 1. Customer books Pharaoh's (network) room by card; the item is pending supplier. 2. The supplier board shows the request; the supplier confirms with its own reference. 3. Customer sees **Confirmed** and **Paid** (authorisation captured at confirmation, PAY-6) and the supplier reference. 4. Admin finds the booking and its finance panel. 5. Customer cancels: refund previewed, item cancelled, trip under Cancelled with its refund status. 6. Supplier board no longer shows it pending. 7. **Platform trial balance balanced.** | `lifecycle/cross-role.spec.ts` | Passed |
| L2 | Hotel, B2C, supplier rejects | Customer → supplier → customer | Supplier rejects with a reason; the customer sees the item **rejected** with that reason, and the card isn't charged. | `lifecycle/cross-role.spec.ts` | Passed |
| L3 | Inventory to availability | Supplier → customer | Stop-sell on Pharaoh's Standard room for the dates removes exactly that option from customer results; reopening brings it back. | `lifecycle/cross-role.spec.ts` | Passed |
| L4 | Agency B2B, full cycle | Agency → supplier → agency | Booking held on the wallet → supplier confirms on its board and sees the payable → invoice issued → balance collected → voucher → cancellation with fee and refund → **trial balance balanced**. | `lifecycle/booking-lifecycle.spec.ts` | Passed |
| L5 | Customer storefront self-service | Customer | Book by card, find in My bookings, cancel with refund preview. | `lifecycle/booking-lifecycle.spec.ts` | Passed |
| L6 | All seven services, customer | Customer | For hotel, flight, tour, visa (with a document upload), Umrah (mahram), activity (time slot) and transfer: search → photo → details and policy → cart → re-check → service-specific travellers → card → confirmation → My bookings → details (`data-service`) → cancel with refund preview → Cancelled tab. | `services/booking-per-service.spec.ts` | 7/7 passed (Chrome, Firefox, WebKit) |
| L7 | Supplier price to customer price | Supplier → customer | Supplier sets net EGP 2,000, then 2,100 per night. The customer price rises by the independently computed 2 × 100 × 1.05 × 1.14 × 1.14 ≈ **EGP 272.92**, within the storefront's whole-pound rounding. | `supplier/supplier.spec.ts` | Passed |
| L8 | Supplier content to customer | Supplier → customer → other supplier | Description edited and persisted; customers see it in the offer sheet; another supplier can't find the product. | `supplier/supplier.spec.ts` | Passed |
| L9 | Wallet funding | Agency → platform → agency | Top-up request isn't credited until approved; after platform approval the available balance is **exactly +EGP 2,500.00**. | `agency/agency.spec.ts` | Passed |
| L10 | Agency markup change | Agency | Hotels rule 12% → 15% creates version 2 (old one kept, PRC-14). The simulator total becomes **EGP 1,389.66** (computed independently). | `agency/agency.spec.ts` | Passed |
| L11 | Promo code | Agency | Created, persisted, applied by the engine (**EGP 1,258.67**, independent maths), deactivated, then refused. | `admin/admin-management.spec.ts` | Passed |
| L12 | Compliance gate | Pending agency → platform → agency | Pending-KYC agency can't book (`ORG_NOT_ELIGIBLE`) → platform accepts every document and approves → organisation **Active** → agency books. | `admin/admin-management.spec.ts` | Passed (was failing: bug B1) |

## Pricing, payments and accounting

| Check | Expected (computed in the test) | Spec | Result |
|---|---|---|---|
| Hotel, network: platform rule 6% → agency 12% → VAT 14% (net 1,000) | +60.00, +127.20, +166.21 → **1,353.41** | `finance/pricing-chain.spec.ts` | Passed |
| Hotel, agency-own stock: **no platform markup** | +120.00, VAT 156.80 → **1,276.80** | same | Passed |
| Tour, API supplier, 2 pax: default 8%, agency fixed EGP 150 per person | **1,573.20** | same | Passed |
| Activity, API: 8% / default 10% | **1,354.32** | same | Passed |
| Flight, API: **no VAT on flights** | **1,188.00** | same | Passed |
| Umrah, network: Umrah rule 4% / default 10% | **1,304.16** | same | Passed |
| Sub-agency 5% compounds on the agency price; **agency never sees the platform layer** | **1,421.08** | same | Passed |
| Declined card | Clear error, **no booking** in My bookings | `finance/payments.spec.ts` | Passed |
| 3-D Secure | Code required; wrong code refused; right code books one trip | same | Passed |
| Double submit | **Exactly one** booking (idempotency key) | same | Passed |
| Card payment status | "Card authorised" at checkout, "Paid" after confirmation | `finance/payments.spec.ts`, L1 | Passed |
| Pay later (enabled on the demo storefront, decision G3) | Booking created **Unpaid** | `finance/payments.spec.ts` | Passed |
| Instalments | The last due date can't be after the service start (day after disabled, no paging past) | same | Passed |
| Ledger | Trial balance **Balanced** after B2B and B2C cycles | L1, L4 | Passed |

Also covered by unit tests, run on every gate:
- FX lock;
- rounding adjustment;
- guardrails and the margin floor;
- invoice adjustments after tax;
- cancellation fee on selling price with the agency admin fee;
- partial refunds;
- ledger double entry.

That's the `domain` pricing, ledger and instalment suites, plus the `mock-server` finance and checkout tests (244 tests in those two packages).

## Not covered in the browser

- **Amendments:** not implemented (KNOWN_ISSUES K5).
- **Partial payments outside instalments:** not exercised in the browser.
- **Supplier commissions UI:** commission is a settlement component, unit-tested in the pricing engine; there is no UI check.
- **Multi-currency storefront sale in the UI:** currency conversion is checked in unit tests only.
