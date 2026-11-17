# Responsive test results

The web app tested at the seven requested viewports with Playwright (Chrome, touch on tablets and phones). Status is from the final run on 17 Nov 2026.

## Device matrix (`responsive/viewports.matrix.spec.ts`, 6 checks × 7 viewports = 42 runs)

| Check | 1440×900 | 1920×1080 | 1024×768 | 768×1024 | 430×932 | 390×844 | 375×812 |
|---|---|---|---|---|---|---|---|
| Landing and search: no sideways scroll; destination list and check-in calendar open fully on screen; search button touch-sized on phones | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Results and product sheet fit; Add to cart reachable, ≥ 40 px tall on phones | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Customer profile menu on screen; profile, bookings, travellers and settings fit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sign-in (customer and business) and registration fit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Staff portal: sidebar from 1024 px; below that the menu drawer opens on screen and navigates | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Arabic + dark: storefront and account mirror without sideways scroll; RTL calendar on screen | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

"On screen" means the popup's bounding box lies within the viewport once its entrance animation has settled.

## Other responsive suites

| Spec | Viewport | Covers | Result |
|---|---|---|---|
| `responsive/responsive.mobile.spec.ts` | Pixel 7, dark | No sideways scroll and axe on the main screens for public, customer, agency and admin | Passed |
| `customer/account.mobile.spec.ts` | Pixel 7 | Phone profile menu and scrolling account navigation | Passed |
| `services/hotel-map.mobile.spec.ts` | Pixel 7 | Show map, tap a price pill, preview card, back to the list | Passed |
| `responsive/dashboard-controls.spec.ts` | 390×844 + desktop | Dashboard selects and date pickers: no native controls, keyboard type-ahead, year jump, clear, min/max, Arabic dark with axe while open, phone width | Passed |
| `services/search-form.spec.ts` | desktop | Reduced motion, RTL, keyboard tabs and selects, date picker rules | Passed |

## Findings

- **Fixed:** the new `DateInput` minimum width overflowed narrow grid columns (the traveller card); bulk-edit dates truncated the year. See KNOWN_ISSUES B6.
- **Fixed earlier this session:** the account navigation caused page-wide sideways scrolling on phones.
- **No open responsive defects** in the tested screens.

## Not covered

- **Real devices and browsers on phones:** these are Chromium viewports with touch, not mobile Safari or Chrome on hardware. WebKit is covered at desktop size only.
- **Font scaling, the on-screen keyboard and orientation changes** during a flow.
