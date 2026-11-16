# Final project audit (Stage 1) — 16 Nov 2026

**Scope of this stage:** inspection and testing only. No application code was changed. The only file written is this document. Every status below is based on code, routes and tests, and on the runs listed in §9. Documentation alone counted for nothing.

**Status legend**
- ✅ **Verified:** implemented and exercised by automated tests or a real browser run.
- 🟡 **Not fully tested:** implemented, but not exercised end-to-end.
- 🟠 **Partial:** only some of the required behaviour exists.
- ❌ **Not implemented.**
- ⛔ **Blocked:** needs something outside this machine or this phase.

---

## 1. Phase and milestone completion matrix

| # | Milestone | Status | Evidence (what was actually run) | Missing / known bugs |
|---|---|---|---|---|
| 1 | Monorepo, shared packages, contracts | ✅ | 28 / 28 typecheck + lint tasks. Package-boundary lint rules. Contract tests (every operation the apps call exists; public-operation allow-list) | — |
| 2 | Design system (light/dark, en/ar, RTL) | ✅ web · 🟠 mobile | 55 token tests (contrast). axe on 26 web screens. Phone dark-mode scans | Mobile dark mode and RTL are not runtime-tested on a device. No photography anywhere (§7) |
| 3 | Authentication and permissions | ✅ web · 🟠 mobile | Server tests (auth, tenant isolation, reset, lockout, expiry). e2e: register → verify → reset → sign in; cross-tenant URL returns "not found" | **Mobile login fails in the browser (Expo Web)** (§4). No show/hide password, confirm password, remember me or segmented code input (§5) |
| 4 | Admin CRUD | ✅ core · 🟠 overall | e2e scenario A (create, edit, publish, pause, reactivate, archive, delete, audit). Locations CRUD. Organisation profile edit | CMS, reviews, ticket queue, newsletter, currency, languages, feature flags: ❌. No admin "create organization" form |
| 5 | Customer storefront (landing) | 🟠 | e2e: search, book, account | No photography. Missing from the brief: featured destinations, popular hotels / tours / Umrah sections, testimonials, newsletter, header service links, currency switcher |
| 6 | Multi-service search (7 services) | ✅ / 🟠 | Server search tests for all 7. Browser run on hotels. Mobile web: results render | Flights are one-way only (no round-trip or multi-city). Only hotels have a map |
| 7 | Hotel maps and locations | ✅ web · ⛔/❌ mobile | e2e: split and map views, marker ↔ card linking, search-as-I-move, empty area, location panel, admin coordinates | **Mobile map is blank on Expo Web** ("React Native WebView does not support this platform"). Native map is not runtime-tested |
| 8 | Booking lifecycle | ✅ | e2e: agency booking → supplier confirm → invoice → collect → voucher → cancel. Customer card booking. Server lifecycle tests | Amendments with repricing ❌. Extended state list from the brief ❌ (refund state is tracked on cancellations) |
| 9 | Pricing engine | ✅ | Domain + server pricing tests, simulator | — |
| 10 | Payments and refunds | ✅ | Finance tests (instalments golden vector, cancellation fees, refund caps), e2e collect / refund | Customer wallet and debit notes ❌ |
| 11 | Accounting | ✅ | Every entry balances; trial balance is zero; wallets equal their transactions; the profit KPI is re-derived from the ledger | Seeded expenses make the profit negative (data, awaiting your decision) |
| 12 | Agency portal | ✅ | e2e: booking, wallet, accounting, CRM screens scanned by axe | — |
| 13 | Supplier portal | ✅ | e2e: reservation board confirm, statement / payable | — |
| 14 | Customer account | ✅ | e2e: trips, cancel with refund, favourites, support, profile | — |
| 15 | Mobile onboarding | 🟠 | Expo Web run: screen 1 renders, Skip works and is remembered after reload | **The Next button does not advance on web.** No Previous button. Emoji visuals and no photography. Copy differs from your brief |
| 16 | Mobile authentication | 🟠 | Expo Web: login and forgot-password screens render | **Login throws on web** (SecureStore has no web implementation). Device runtime ⛔ |
| 17 | Mobile home and navigation | ✅ web-rendered · ⛔ device | Expo Web: Home, Explore, Bookings, Favorites and Profile tabs and the bell all render | No images. Featured destinations are flat colour tiles |
| 18 | Mobile search and booking | 🟠 | Expo Web: search → results (sort, filter, heart, distance) → product with options renders | Booking not reached on web because login fails. Device runtime ⛔ |
| 19 | Reports and analytics | ✅ | 9 reports, CSV export, dashboard profit breakdown, audit test | — |
| 20 | Testing and accessibility | ✅ web · ❌ mobile | 336 unit / integration tests. 33 Playwright tests incl. axe WCAG 2.1 AA on 26 screens | **The mobile app has 0 tests.** No Expo Web browser tests |

### Differences from the approved requirements
- **Customer login messaging:** the customer login page shows B2B copy ("One platform for agencies, suppliers…").
- **Mobile tabs:** the bottom tabs match the brief (Home, Explore, Bookings, Favorites, Profile). Notifications moved behind the bell.
- **Unapproved business rules:** the open items are in `BUSINESS_DECISIONS_FOR_APPROVAL.md`, with B3 (suspended storefronts) the most urgent. None have been changed.

---

## 2. Broken features (found by running the apps today)

| # | Where | Symptom | Root cause | Proposed fix |
|---|---|---|---|---|
| B1 | Mobile, Expo Web | Login and registration fail with "Unexpected error" | `expo-secure-store`'s web build is an empty module (`export default {}`), so `setItemAsync` throws in `services/secure-session.ts` | Add a `secure-session.web.ts` that uses browser storage, documented as weaker than the native keychain. Native keeps SecureStore unchanged |
| B2 | Mobile, Expo Web | Maps show "React Native WebView does not support this platform" (results map and hotel location) | `react-native-webview` has no web implementation | Add a `map-view.web.tsx` that renders the same Leaflet map directly in the DOM (same provider and markers API). Native keeps the WebView |
| B3 | Mobile, Expo Web | Onboarding "Next" does nothing; Skip works | `FlatList.scrollToIndex` with `pagingEnabled` and `onViewableItemsChanged` doesn't page reliably on react-native-web; the index never updates | Drive the slide index from state (Next / Previous set it, then scroll by offset) instead of reading it back from viewability |
| B4 | Mobile, native | Not verified | — | ⛔ Needs a device or emulator (§4) |

No broken features were found on the web app. The full Playwright suite and the axe scans pass.

---

## 3. Web testing status

| Area | Status |
|---|---|
| Landing, navigation, search for 7 services, results, filters, sort | ✅ (e2e on hotels; server tests for all 7) |
| Hotel maps and product details | ✅ e2e |
| Customer authentication and account | ✅ e2e |
| Admin dashboard and CRUD, agency portal, supplier portal | ✅ e2e |
| Bookings, payments, refunds, accounting, reports | ✅ e2e + server tests |
| Responsive (phone width), dark theme | ✅ e2e scans on main screens |
| Arabic RTL | 🟠 rendered and scanned on `/ar` pages; no full Arabic booking journey in e2e |
| Console errors | ✅ every e2e test fails on any console error or HTTP 4xx/5xx; none occurred |

**Gaps to add in Stage 2:** an e2e run of each of the other six services' search → detail flow; an Arabic booking journey; light/dark visual checks of the auth pages after the redesign.

---

## 4. Mobile testing status and Expo Web compatibility

**Devices:** there is no Android SDK, emulator or `adb`, and only the Xcode command-line tools (no iOS Simulator). **Native runtime testing is ⛔ blocked on this machine.** A physical Android phone with Expo Go is the route (`docs/MOBILE_TESTING.md` has the steps and a 17-item checklist).

**Expo Web:** `react-native-web` and `react-dom` resolve, and `expo export --platform web` succeeds. I served the export locally and drove it in Chrome at 390×844:

| Check | Web result |
|---|---|
| First launch shows onboarding | ✅ |
| Skip, and persistence after reload | ✅ |
| Next / Get started | ❌ B3 |
| Home, tabs, bell | ✅ renders, no console errors |
| Explore → search → results (sort, filters, hearts, distance) | ✅ |
| Product details | ✅ (location card blank, B2) |
| Results map | ❌ B2 |
| Login and registration | ❌ B1 |
| Forgot-password screen | ✅ renders (flow not completable until B1 is fixed) |
| Booking, trips, voucher | Not reached (blocked by B1) |
| Arabic RTL | Not tested yet |

**Native modules and web support** (to be documented per platform in Stage 2):

| Module | Web | Plan |
|---|---|---|
| SecureStore | none | B1 |
| WebView | none | B2 |
| expo-print (voucher PDF) | browser print dialog | Use the print dialog on web, labelled as such |
| expo-sharing | limited (Web Share API) | Fall back to a download |
| expo-file-system (`File`) | none | Export uses a browser download on web |
| expo-notifications (local) | none | Hide the local reminders toggle on web with an explanation |
| expo-document-picker | works | — |

**Scripts:** there is no `web` script and no `web` section in `app.json`. Stage 2 adds a `pnpm --filter @travelta/mobile web` command (`expo start --web`).

---

## 5. Authentication UX review

**Web, today:** a split layout with a brand panel on the left and the form on the right. It is clean and accessible (the axe scan passes).

**Issues to fix:**
- **Brand panel:** no photography. The customer pages reuse B2B copy.
- **Passwords:** no show/hide toggle on any password field. No confirm password on registration.
- **Terms and remember me:** no terms acceptance. The session already persists, so "remember me" would only make sense if it switched between session-only and persistent storage. I'll implement it only that way, or leave it out.
- **Reset flow:**
  - two steps on one page, with a single code text box;
  - no clear step indicator ("1 Email → 2 Code → 3 New password → Done");
  - no explicit success screen (it redirects with a toast);
  - no distinct message for an expired code versus an invalid one (the server returns one message for both, by design, to avoid leaking information);
  - no resend cooldown. I'll add a client-side resend countdown (60 s). Expiry is real on the server (15 min) and will be shown.
- **Email verification:** a banner and dialog. Fine, but it needs a segmented code input.

**Mobile, today:** plain single-column forms, no imagery, and no show/hide password. Login is broken on web (B1).

**Proposal:**
- **Desktop:** a destination photo on one side with a short customer value line, and the form on the other. Business sign-in keeps its B2B copy.
- **Phone:** one column with a slim image header.
- **Shared components:** password field with show/hide, a 6-box code input (paste-aware, auto-advance, RTL-safe), a step indicator, and a success state.
- **Same code path:** everything reuses the existing `auth.*` operations. There is no second auth implementation.

---

## 6. Onboarding UX review (mobile)

**Today:** 4 slides, each an emoji in a coloured circle. Skip works and is remembered. Next is broken on web (B3), and there is no Previous button.

**Proposal:**
- **Content:** your four headlines and descriptions, word for word, each with a full-bleed destination photo and a gradient scrim so the text stays readable.
- **Controls:** a progress indicator, Previous (from slide 2), Next, Get started and Skip.
- **Behaviour:** safe areas, Arabic RTL order, controls with screen-reader labels, and a "reset onboarding" option in Profile (already present).

---

## 7. Image asset review

**Today there is no photography anywhere.** Web and mobile use generated gradient thumbnails (`ProductThumb`, seeded by `imageSeed`), icons and flat colour tiles.

**Proposal:**
- **Source:** Wikimedia Commons, which is reachable from this machine. Its API returns each file's licence and author, so licensing is *verified*, not assumed. Only CC0, public-domain, CC-BY and CC-BY-SA files are taken. I won't invent or hot-link URLs.
- **Storage:** images are downloaded once, resized and cropped to fixed ratios (16:9 hero, 4:3 card, 1:1 thumbnail) with macOS `sips`, and stored locally:
  - web: `apps/web/public/images/travel/…`, served through `next/image`;
  - mobile: `apps/mobile/assets/travel/…`, bundled.
- **Mapping:** one central map in the shared package (`packages/shared/src/travel-images.ts`), keyed by service and category. It holds the alt text in English and Arabic, the credit and the licence.
- **Credits:** a credits page lists them, as CC-BY requires.
- **Coverage, about 40–50 images:**
  - **Hotels:** room, exterior, pool resort, lobby, city, beach.
  - **Flights:** aircraft, terminal, cabin.
  - **Tours:** Luxor temple, pyramids, Nile felucca, a city walk.
  - **Visas:** passport and documents, immigration.
  - **Umrah:** Masjid al-Haram, the Kaaba, the Clock Tower view, the Prophet's Mosque in Madinah. Respectful, wide architectural shots only; no close-ups of worshippers.
  - **Activities:** Red Sea diving, desert safari, hiking, a family experience.
  - **Transfers:** coach, airport car, minivan.
  - **Destinations:** the 12 seeded destinations, for featured destinations, auth and onboarding.
- **Where they appear:** the landing hero and service cards, result cards (a deterministic pick per product from its service and category, so the same hotel always shows the same photo and unrelated services never share one), product details, auth panels, onboarding, mobile Home and featured destinations, and promotions.
- **Loading:** lazy loading, a blurred or solid placeholder, a fallback to the current generated thumbnail if a file is missing, and a check in tests that every mapped file exists.

---

## 8. Performance and accessibility

- **Accessibility:** axe WCAG 2.1 A/AA reports 0 violations on 26 web screens plus phone dark-mode scans. Five issues were fixed in the previous round. The mobile app has no automated accessibility checks; I'll add them to the Expo Web tests where web semantics allow.
- **Performance:**
  - Each mobile bundle is 5.1 MB of Hermes bytecode per platform.
  - The web production build is fine. Leaflet loads lazily only on map views.
  - Adding photos needs `next/image` sizing and lazy loading to protect the landing page's largest paint. Local images keep that within budget.
  - The 6-month seeded history makes the first launch's seed step noticeable (about 1–2 s). This is acceptable for a demo.

---

## 9. Verification performed for this audit (today)

| Run | Result |
|---|---|
| `pnpm turbo run test` | 16 / 16 tasks passed (336 tests) |
| Playwright, full suite against the production build on :3001 | 33 / 33 passed |
| Expo Web export (to a scratch folder, not the repo) | Succeeded |
| Expo Web runtime in Chrome (390×844) | See §4; defects B1–B3 |
| Web visual review (screenshots of landing, login, register, Arabic on a phone) | See §5 and §7 |
| Android / iOS runtime | ⛔ no emulator or simulator available |

---

## 10. Proposed Stage 2 plan (your milestones, in order)

1. **Fixes:** B1–B3 (web session store, DOM map, onboarding paging). Platform-specific fallbacks for print, sharing, file system and notifications. Add the `web` script.
2. **Web E2E:** search → detail for each of the other six services; an Arabic booking journey; auth-flow tests updated for the redesign.
3. **Expo runtime:** a Playwright suite against Expo Web covering onboarding, auth, search, map, booking and RTL. Mobile unit tests for the onboarding state, session store and favourites hook. A web / Android / iOS support table. Device testing stays ⛔ unless a device is available.
4. **Auth UI/UX:** web and mobile, as in §5.
5. **Onboarding:** as in §6, with your copy.
6. **Images:** as in §7. Licence-verified local assets, a central mapping, credits, and use across the landing page, results, details, auth, onboarding and Home. The landing page also gets the missing sections: featured destinations, popular hotels / tours / Umrah, why Travelta, how it works, and a footer with real links. No testimonials or newsletter unless you want sample content clearly labelled as demo.
7. **Regression:** the full gates (typecheck, lint, unit, Playwright + axe web and Expo Web, production build, Expo iOS and Android export), then `PROJECT_COMPLETION_AUDIT.md` with the final matrix.

**Not planned unless you ask:** CMS, reviews, a ticket queue, newsletter, currency / languages / feature-flag admin, round-trip and multi-city flights, amendments. These are larger functional features, not polish.

Waiting for your approval before changing any code.
