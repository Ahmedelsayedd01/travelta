# Project completion audit (after Stage 2), 17 Nov 2026

This follows `FINAL_PROJECT_AUDIT.md` (Stage 1). Every status below is backed by a command that was actually run (§9).

**Status legend**
- ✅ **Verified:** implemented and exercised by automated tests in a real browser or Node.
- 🟡 **Built, not device-tested.**
- 🟠 **Partial.**
- ❌ **Not implemented.**
- ⛔ **Blocked:** needs something this machine doesn't have.

## 1. Phase completion matrix

| # | Milestone | Status | Verification |
|---|---|---|---|
| 1 | Monorepo, shared packages, contracts | ✅ | 28 / 28 typecheck + lint tasks; contract tests (including the photo catalogue against app assets) |
| 2 | Design system (light / dark, en / ar, RTL) | ✅ web · ✅ Expo Web · 🟡 native | axe on 26 web screens and phone dark mode; Expo Web Arabic RTL test |
| 3 | Authentication and permissions | ✅ | Server tests (reset, lockout, expiry, verification). Web e2e: register (confirm + terms), verify by code, guided reset, keep-me-signed-in, show/hide. Expo Web e2e: sign in / out, persistence, register, verify, reset |
| 4 | Platform admin CRUD | ✅ core · 🟠 overall | e2e scenario A, locations, organisation edit. CMS, reviews, ticket queue, newsletter, currency / language / feature admin are ❌ (not requested for this round) |
| 5 | Customer storefront (landing) | ✅ | e2e: photos load with none broken, each service tile shows its own photo, featured destinations open search, live popular rows, credits page |
| 6 | Multi-service search (7 services) | ✅ | Web e2e: search → results with service photo → details (options, policy) for **each** of the 7. Expo Web e2e: search for each of the 7 |
| 7 | Hotel maps and locations | ✅ web · ✅ Expo Web · 🟡 native | Web e2e (split / map views, marker ↔ card, search-as-I-move). Expo Web e2e (price markers, preview, hotel location map) |
| 8 | Booking lifecycle | ✅ | Web e2e: agency → supplier → invoice → collect → voucher → cancel; customer card booking. Expo Web e2e: card booking → trip |
| 9 | Pricing engine | ✅ | Domain + server tests |
| 10 | Payments and refunds | ✅ | Finance tests; e2e collect, refund, cancellation |
| 11 | Accounting | ✅ | Ledger balance, trial balance, wallets, profit-KPI audit |
| 12 | Agency portal | ✅ | e2e + axe |
| 13 | Supplier portal | ✅ | e2e (board confirm, statement) |
| 14 | Customer account | ✅ | e2e (trips, cancel, favourites, support) |
| 15 | Mobile onboarding | ✅ Expo Web · 🟡 native | Expo Web e2e: photos, Next / Previous / Get started, Skip, persistence after reload |
| 16 | Mobile authentication | ✅ Expo Web · 🟡 native | Expo Web e2e (see #3). Native SecureStore is unchanged and not device-tested |
| 17 | Mobile home and navigation | ✅ Expo Web · 🟡 native | Expo Web e2e: all tabs, photos for services and destinations, no broken images, axe on home / explore / login |
| 18 | Mobile search and booking | ✅ Expo Web · 🟡 native | Expo Web e2e: hotel search → map → preview → product → cart → card checkout → trip; favourites |
| 19 | Reports and analytics | ✅ | Server tests, dashboard breakdown e2e |
| 20 | Testing and accessibility | ✅ | 339 unit / integration tests; 44 web e2e; 18 Expo Web e2e; axe |
| — | Native runtime (Android / iOS) | ⛔ | No emulator, simulator or Android SDK on this machine. Bundles export; `expo-doctor` passes 20 / 20 |

## 2. Bugs fixed in Stage 2 (each found by running the apps)

1. **Mobile web login failed.** `expo-secure-store` has no web build. Fix: a web session store; native is unchanged.
2. **Mobile web maps were blank.** `react-native-webview` has no web build. Fix: a Leaflet DOM map with the same props.
3. **Onboarding "Next" did nothing on web.** Scroll-based paging didn't page on react-native-web. Fix: state-driven slides with gestures.
4. **Every mobile message and confirmation was silently lost on web** (react-native-web's `Alert.alert` is empty), so demo reset and import were dead buttons. Fix: a cross-platform `showAlert` that uses a toast or a confirm dialog on web.
5. **Language switching did nothing on web.** `I18nManager` is a stub there. Fix: the locale is persisted and the page's `dir` / `lang` are set.
6. **Metro picked the native `alert.ts` over `alert.web.tsx`** (resolution order across extensions). Fix: both files use the same extension.
7. **Tapping the terms checkbox opened the terms page** (the link was nested inside the tap area). Fix: separate controls.
8. **Password-mismatch errors only appeared after every other field was valid.** Fix: the check runs together with the other field errors.
9. **Code boxes blocked one-time-code autofill** (`maxLength = 1`). Fix: the limit is removed and digits are spread across the boxes.
10. **`react-dom` was missing as a peer of react-native-web** (it worked only through hoisting). Fix: it is now installed directly.
11. **The customer login reused B2B copy.** Fix: an audience-specific panel.
12. **Repeated photos in landing rows; unbalanced destination grid.** Fix: distinct photos per row; five destination cards fill the grid.

## 3. Authentication UX (web and mobile)

**Web**
- **Layout:** a photo split layout per page with customer or business copy, and a slim photo banner on phones.
- **Controls:** show/hide password, and "keep me signed in". When unchecked, the session is kept in tab storage and ends when the tab closes.
- **Registration:** confirm password and terms acceptance; both errors are shown together.
- **Password reset:** a guided flow (step bar for email, code and new password), 6-box code input (paste and autofill), the 15-minute expiry note, a 60 s resend countdown, invalid and expired codes sent back to the code step, and a success screen.
- **Email verification:** the same code input.

**Mobile**
- **Layout:** a photo header with a gradient scrim and back control.
- **Controls:** password "Show / Hide", confirm password and a terms checkbox with a separate link.
- **Password reset:** the same guided flow, with a 6-box code (one real input for keyboard, autofill and screen readers), resend countdown and a success state.
- **Same backend:** the same `auth.*` operations as before; no second implementation.

## 4. Onboarding (mobile)

- **Content:** your four headlines and descriptions word for word (English and Arabic), each over its own photo: Luxor Temple, a resort pool, an aircraft wing and a balloon over Luxor.
- **Controls:** a progress indicator, Skip, Previous (from slide 2), Next and Get started.
- **Behaviour:** swipe in the reading direction, a 280 ms fade-and-slide transition, safe areas, and a screen-reader announcement per slide.
- **Persistence:** shown once per install. Profile → "Show the introduction again" replays it.

## 5. Images and service mapping

- **Source:** 40 photos from Wikimedia Commons. Each licence was checked through the Commons API: CC0, public domain, CC BY or CC BY-SA. Author, licence and source are listed on `/credits`.
- **Formats:** each is cropped to 16:9 (1600×900, heroes) and 4:3 (800×600, cards and mobile).
- **Catalogue:** `packages/shared/src/travel-images.ts`, with bilingual alt text per photo.
- **Review:** every pick was checked visually. More than a dozen picks were rejected and replaced; examples are a Cape Town clock tower, a US motel named "Ocean Mecca", a giant clam, a close-up of a worshipper, and dark or outdated shots.
- **Umrah:** only wide architectural views.

| Service | Photos |
|---|---|
| Hotels | resort pool, hotel room, beach resort (Hurghada), lobby, Nile-side hotel (Cairo), hotel exterior |
| Flights | Boeing 787, wing above clouds, modern cabin, departure hall |
| Tours | Giza pyramids, Karnak temple, Nile feluccas, Khan el-Khalili |
| Visas | passport stamps, immigration hall, antique world map |
| Umrah | Masjid al-Haram panorama, the Kaaba, umbrellas at the Prophet's Mosque, Makkah Clock Tower |
| Activities | Red Sea diving, balloon over Luxor, White Desert camels, Sinai mountains, Bosphorus cruise |
| Transfers | tour coach, private sedan, passenger van |
| Destinations | the 12 seeded destinations. Makkah reuses the Clock Tower photo because no other suitable licensed photo was found |

- **Where they appear:** landing hero, service tiles, featured destinations, popular rows, result cards, product details, auth panels, mobile onboarding, mobile home, results, product and favourites.
- **Fallback:** if a photo fails to load, the generated brand gradient is shown.
- **Tests:** a contract test fails if any catalogue key lacks its web hero, web card or mobile file.

## 6. Platform support

| Feature | Web (Next.js) | Expo Web | Android / iOS |
|---|---|---|---|
| Onboarding, auth, search, booking, favourites | ✅ | ✅ tested | 🟡 built |
| Session storage | localStorage / sessionStorage | localStorage (weaker; labelled) | SecureStore (keychain / keystore) |
| Maps | Leaflet | Leaflet in the DOM | Leaflet in a WebView |
| Voucher PDF | printable page | browser print dialog (Save as PDF) | PDF + share sheet |
| Demo export / import | download / file picker | download / file picker | share sheet / document picker |
| Alerts and confirmations | toasts / dialogs | toast / `window.confirm` | native alerts |
| Local notifications | — | not supported (in-app centre only) | 🟡 built, when permission is granted |

## 7. Accessibility and performance

- **Accessibility:** axe WCAG 2.1 A/AA reports 0 violations on all scanned web screens (26 + phone dark), plus Expo Web home, explore and login.
- **Performance:**
  - Photos are served through `next/image`, which resizes them and serves modern formats on demand; the landing page keeps one priority hero image.
  - Mobile bundles 40 card photos (5.5 MB of assets). Each native bundle is 5.1 MB of Hermes bytecode.
  - Hotel photos are chosen per service, not per destination, so a city hotel may show a beach-resort photo. This is a known cosmetic limitation.

## 8. Remaining limitations

- **Native runtime:** Android and iOS have not been run on a device (no emulator or simulator here). Use the checklist in `MOBILE_TESTING.md`.
- **Expo Web session security:** the session token sits in localStorage on Expo Web, as documented. Native uses SecureStore.
- **Not built:** CMS, reviews, a ticket queue, newsletter, currency / language / feature-flag admin, round-trip and multi-city flights, amendments, and the extended booking states.
- **Unapproved business rules:** pending your decisions in `BUSINESS_DECISIONS_FOR_APPROVAL.md`.

## 9. Commands run (17 Nov 2026)

| Command | Result |
|---|---|
| `pnpm turbo run typecheck lint test --force` | 28 / 28 tasks passed; **339 tests** (shared 23, design-tokens 55, contracts 2, i18n 5, schemas 9, domain 60, mock-server 179, api-client 6). 5 lint warnings already existed |
| `pnpm --filter @travelta/web build` + Playwright (`apps/web/e2e`) | **44 / 44 passed** (desktop + Pixel 7) |
| `pnpm --filter @travelta/mobile export:web` + Playwright (`apps/mobile/e2e-web`) | **18 / 18 passed** (Pixel 7) |
| `expo export --platform ios --platform android` | Passed (5.1 MB each) |
| `npx expo-doctor` | 20 / 20 checks passed |
| Native device or simulator run | ⛔ not available |

## 10. How to run

```bash
pnpm install
pnpm dev:web                                  # web: http://localhost:3001
pnpm --filter @travelta/mobile web            # mobile app in the browser (Expo Web)
pnpm dev:mobile                               # Expo dev server; scan the QR code with Expo Go
pnpm check                                    # typecheck + lint + unit tests
pnpm --filter @travelta/web e2e               # web browser tests (builds and starts :3001)
pnpm --filter @travelta/mobile e2e:web       # Expo Web browser tests (exports and serves :8090)
```
