# Pricing Engine

Decision on Q4/Q5 (15 Nov 2026): a complete, configurable pricing engine shared by all seven services. It's implemented in `@travelta/domain/pricing` as pure functions. The mock server calls it now, and NestJS will call it later. **Frontend simulation in this phase. It must run server-side in production, and client-computed prices are never trusted.**

## 1. Price chain

```
Supplier Net ─► Platform Markup ─► Agency Markup ─► Sub-Agency Markup ─► Fees ─► Discounts ─► Tax ─► Rounding ─► Final Customer Price
                (compounding: each % applies to the price produced by the previous layer)
```

**Supplier commission is not part of the chain.** It's a settlement component: it changes who receives the money, never what the customer pays (§5).

## 2. Inputs
```ts
interface PricingRequest {
  serviceType: ServiceType;                 // hotel | flight | tour | visa | umrah | activity | transfer
  source: 'extranet' | 'manual' | 'tbo' | 'hotelbeds';
  supplier: { id; ownership: 'api' | 'network' | 'agency_own' }; // network = supplier org registered on Travelta
  productId?; destinationId?; nationalityGroupId?;
  seller: { platformId; agencyId?; subAgencyId? };              // the sales chain for this sale
  channel: 'b2b' | 'b2c';
  customerType: 'individual' | 'corporate' | 'sub_agent' | 'vip' | string; // configurable list
  lines: NetLine[];        // supplier net per unit, in supplier currency (room-night, pax-type, seat, vehicle, ticket…)
  fees?: FeeInput[]; promoCode?: string; manualDiscount?: DiscountInput;
  overrides?: OverrideInput[];             // per layer, permission-checked
  targetCurrency: CurrencyCode;
  bookingDate: ISODate; serviceDates: { start: ISODate; end?: ISODate };
}
interface NetLine { unitType: UnitType; quantity: number; netMinor: number; currency: CurrencyCode; taxProfileId?: string; label: LocalizedText }
```
Each service has an **adapter** in `domain/pricing/services/<service>.ts` that turns its booking details into `NetLine[]`:
- hotel: room-nights per room type + supplements + child rates
- flight: fare per pax type + taxes from the supplier as pass-through lines
- tour: price per person type + extras
- visa: fee per pax type + embassy fee pass-through
- umrah: per-occupancy package price + add-ons (flight, visa, transport)
- activity: per age band per slot
- transfer: per seat or per vehicle.

The engine itself is service-agnostic.

## 3. Steps (deterministic order)
1. **FX conversion**: each net line is converted to the pricing currency with the **FX snapshot** `{pair, rate, source, at}` (FX-1). An optional FX buffer (`commercialSettings.fxBufferPct`, DEMO 0%) is applied and recorded as its own platform revenue line, so it isn't hidden.
2. **Platform layer**: applies **only if** `supplier.ownership ∈ {api, network}`. **Never to `agency_own` stock** (agency extranet or the agency's own manual suppliers).
3. **Agency layer**: the agency's own rules. For Travelta Direct (platform B2C storefront) this layer belongs to the platform's retail seller org.
4. **Sub-agency layer**: when a sub-agency sells. Its base is the agency's B2B price to that sub-agency.
5. **Fees**: booking or service fees, each `percent | fixed`, `perUnit | perBooking`, with an owner (which party earns it) and a `taxable` flag.
6. **Discounts**: promo code or manual discount. Applied to the pre-tax amount of eligible lines. Funded by the party that issued it, which reduces that party's revenue only (§5).
7. **Tax**: per tax profile (rate, `inclusive | exclusive`, applies to which components: markup-only/margin-scheme or full price; DEMO default: full price, exclusive).
8. **Rounding** (§6).
9. **Output**: the breakdown + settlement waterfall + metadata (§4).

### Markup computation per layer
```
base_L        = price produced by the previous layer (per unit, in pricing currency)
raw_L         = mode == percent ? base_L × value% : fixedConverted × unitsFactor
clamped_L     = clamp(raw_L, min_L, max_L)          // rule min/max AND guardrails (§3.1)
price_L       = base_L + round(clamped_L)
```
Example (golden test PRC-G1):
- net 1,000.00 USD
- platform 8% → 1,080.00
- agency 10% → 1,188.00
- sub-agency fixed 20.00 → 1,208.00
- tax 14% → 169.12
- **customer 1,377.12 USD**

### 3.1 Min/max limits and guardrails
- Each rule can carry `minAmount` and/or `maxAmount` per unit, plus `minPct`/`maxPct`.
- **Guardrails** set by the tier above (in commercial settings):
  - The platform defines the allowed agency markup range per service (DEMO 0–40%).
  - The agency defines the allowed sub-agency range (DEMO 0–20%).
- A layer below the floor is raised to it; one above the ceiling is capped. The breakdown shows a `clamped` flag.
- **Margin floor**: the final pre-tax sell can never be below the seller's buy price. Discounts that would break this are capped.

## 4. Rule model and resolution
```ts
interface MarkupRule {
  id; version; ownerTenantId; layer: 'platform' | 'agency' | 'sub_agent';
  name; status: 'active' | 'inactive';
  match: {                       // all optional; undefined = wildcard
    serviceTypes?: ServiceType[]; sources?: InventorySource[]; supplierIds?: string[];
    targetAgencyIds?: string[];  // platform rules for specific agencies; agency rules for specific sub-agencies
    productIds?: string[]; destinationIds?: string[]; nationalityGroupIds?: string[];
    customerTypes?: string[]; channel?: 'b2b' | 'b2c';
    bookingWindow?: { from?: ISODate; to?: ISODate }; travelWindow?: { from?: ISODate; to?: ISODate };
  };
  mode: 'percent' | 'fixed'; value: number; fixedCurrency?: CurrencyCode; fixedPer?: 'unit' | 'booking';
  minAmount?; maxAmount?; priority: number; isDemoValue: boolean;
}
```
**Resolution per layer.** The candidates are the active rules owned by that layer's tenant that match all their specified criteria. The winner is the **most specific** rule, by a weighted specificity score:

| Dimension | Weight |
|---|---|
| product | 64 |
| supplier | 32 |
| target agency / sub-agency | 16 |
| destination | 8 |
| nationality group | 4 |
| customer type | 2 |
| service type / source / channel | 1 each |

Ties go to the higher `priority`, then the newest version. If nothing matches, the layer's **default** from commercial settings applies. If there's no default either, the markup is 0 and a warning appears in the breakdown.

So "different agencies have different configurations" works in two ways:
- each agency owns its own agency-layer rules, and
- the platform can target platform-layer rules at specific agencies.

## 5. Supplier commission vs markup (separate concepts)
| | Markup | Supplier commission |
|---|---|---|
| What | An amount the seller adds on top of its buy price | A percentage the **supplier** gives back to the party that contracted it |
| Changes customer price? | **Yes** | **No** |
| Configured in | Markup rules (per layer) | Supplier contract (`commissionPct`, per service, optional per product; DEMO values) |
| Beneficiary | The layer owner | The contract owner: **platform** for network suppliers; **agency** for its own suppliers if the contract has one; API suppliers usually 0 (net rates) |
| Settlement | Earned by the seller from the customer side | Deducted from the **supplier payout** (net − commission) |
| Ledger | Revenue line in seller's ledger at confirmation | Platform: Dr Supplier Payable / Cr Commission Revenue |

### Settlement waterfall (per booking item; always balances)
```
customerTotal = supplierPayout + supplierCommission + platformMarkup + fxBuffer
              + agencyMarkup + subAgencyMarkup + fees − discounts + roundingAdj + tax
```
| Party | Revenue |
|---|---|
| Supplier | `payout = net − commission` |
| Platform | `platformMarkup + commission (if beneficiary) + fxBuffer + platform fees − platform-funded discounts` |
| Agency | `agencyMarkup + agency fees − agency-funded discounts + roundingAdj (if agency is final seller) + commission (own contracts)` |
| Sub-agency | `subAgencyMarkup + its fees − its discounts + roundingAdj (if final seller)` |
| Tax authority | `tax` (Tax Payable of the final seller) |

**Profit and margin**:
- party profit = party revenue
- margin % = party revenue ÷ the party's pre-tax sell
- booking gross profit = customer pre-tax total − supplier payout.

Reports read these from the posted ledger (ACC-3), not from estimates.

## 6. Rounding rules (commercial settings, per tenant and currency)
- **Arithmetic**: integer minor units with half-up rounding after each layer and each line (MON-2).
- **Display / final rounding** (optional, per seller): `none | nearest | up | down` to an increment (e.g. 1.00 EGP, 0.05 USD), and an optional `charm` ending (`.99`).
- The difference goes on a `roundingAdj` line credited to the **final seller**, so totals still reconcile.
- Tax is computed **before** final rounding. Final rounding applies to the customer total and the adjustment is pre-tax revenue. (Default; open question Q18.)

## 7. Overrides (permissioned)
| Override | Permission | Constraint |
|---|---|---|
| Change own layer markup on a quote or booking | `pricing.override_markup` (agency owner, sales if granted) | Within guardrails; reason required |
| Set final sell price directly | `pricing.override_price` | Engine back-solves the seller's markup. Can't go below the margin floor. |
| Break guardrails | `pricing.override_guardrails` (platform super_admin only) | Reason required; flagged in reports |
| Manual discount | `pricing.discount` with max % per role (commercial setting) | Funded by the seller |

Each override is stored in the breakdown (`overriddenBy`, `reason`, `originalAmount`) and the audit log.

## 8. Output: `PriceBreakdown` (stored on every quote, cart item and booking item)
```ts
interface PriceBreakdown {
  id; engineVersion: string; computedAt: ISODateTime; currency: CurrencyCode;
  fx: FxSnapshot[];                       // locked
  lines: Array<{ key: 'net'|'fx_buffer'|'platform_markup'|'agency_markup'|'sub_agency_markup'|'fee'|'discount'|'tax'|'rounding';
                 amountMinor: number; ruleId?: string; ruleVersion?: number; clamped?: boolean; override?: OverrideMeta;
                 owner: 'supplier'|'platform'|'agency'|'sub_agency'|'tax'; perUnit?: { unitType; quantity; unitMinor } }>;
  totals: { netMinor; preTaxMinor; taxMinor; customerTotalMinor };
  settlement: { supplierPayoutMinor; commissionMinor; commissionBeneficiary; platformRevenueMinor; agencyRevenueMinor; subAgencyRevenueMinor; taxPayableMinor };
  margins: { platformPct; agencyPct; subAgencyPct; grossProfitMinor };
  warnings: string[];
}
```
- **Quote**: the breakdown is computed at add-to-cart (15-min validity) and recomputed at recheck.
- **Booking created**: the breakdown is copied to the booking item (FX locked).
- **Booking confirmed**: the breakdown becomes **final and immutable** (`finalizedAt`). Invoice, ledger, payables and reports all read this snapshot. If a supplier confirms at a different net while the item is pending, the item goes to `pending (price_changed)` until the price is accepted. Accepting creates a new breakdown version, and the old one is kept.

Audience projections (redaction) are described in `TENANCY_AND_SECURITY.md §4`.

## 9. History and audit
- **Rules are versioned**. An edit creates version n+1 and the old version is kept. Bookings reference `(ruleId, version)`.
- **Pricing log**: every quote computation is stored (request hash, breakdown id, viewer tenant), with retention capped in the mock DB.
- **Audit log** entries for rule create/update/deactivate, commercial-settings changes, overrides, guardrail breaks and FX rate changes.
- **FX history**: dated rates. A booking shows "rate locked at …" next to today's rate.

## 10. UI
| Screen | Who | What |
|---|---|---|
| Pricing rules (list, filter by layer/service/supplier/agency, create/edit with a live "matches" preview, version history) | Platform (platform layer), Agency owner (agency layer, sub-agency guardrails), Sub-agency owner (its layer) | CRUD with Zod validation; DEMO badge on seeded rules |
| **Pricing simulator** | Platform; agency owner | Pick service, product, supplier, agency, customer type, dates, pax → full waterfall, the rule matched per layer and why (specificity score), settlement split, margins |
| Commercial settings | Platform | Default markups per service/source, guardrails, commission defaults, FX buffer, rounding, plan prices, default credit limits; all flagged DEMO |
| Price breakdown panel | Booking detail, cart, checkout, quotations | Waterfall projected per viewer. Admins see every line plus rule links. |
| Supplier contracts | Platform (network suppliers), Agency (own suppliers) | Commission % per service/product, payout terms |

## 11. Tests (Vitest, rule IDs)
- Golden vectors: PRC-G1 (above); v1 tax example (856 EGP); inclusive tax back-out.
- Platform layer skipped for `agency_own` and applied for `api` and `network`.
- Specificity resolution matrix.
- Clamping (rule min/max, guardrails).
- Margin floor with discount.
- Fixed markup per unit vs per booking, and fixed in a foreign currency.
- Rounding modes plus charm pricing reconcile.
- **Waterfall property test**: for random inputs, customerTotal equals the sum of the settlement parts exactly.
- FX lock immutability.
- Override permissions.
- Rule versioning: an old booking still references its old version.
- Every one of the 7 service adapters produces correct unit lines.
