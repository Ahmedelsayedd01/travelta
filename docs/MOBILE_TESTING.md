# Mobile app: testing status and device instructions

## Status: built, not yet run on a device

**Can it be tested on a simulator here?** No. This build machine has no iOS Simulator (`xcrun simctl` is unavailable because Xcode isn't installed) and no Android SDK or emulator (`adb` and `emulator` are missing). No device or simulator testing has been performed, so **runtime behaviour on a device is not verified**.

| Check | Status |
|---|---|
| TypeScript (`pnpm --filter @travelta/mobile typecheck`) | Passed |
| Lint (`pnpm --filter @travelta/mobile lint`) | Passed |
| iOS bundle (`expo export --platform ios`) | Passed (5.1 MB Hermes bytecode) |
| Android bundle (`expo export --platform android`) | Passed (5.1 MB Hermes bytecode) |
| Shared business logic (mock server, contracts) | 178 server tests, run in Node |
| Running on an Android device or emulator | **Not done** |
| Running on an iPhone or the iOS Simulator | **Not done** |

A successful export proves the app compiles for both platforms and every imported module resolves. It does **not** prove that screens render, that gestures work, or that native modules (SecureStore, WebView, notifications, printing, sharing) behave correctly.

## Testing on a physical Android phone with Expo Go

1. Install **Expo Go** from the Play Store. It must match SDK 58; the app store version is the right one.
2. Put the phone and the computer on the **same Wi‑Fi network**.
3. In the repository, run:
   ```
   pnpm install
   pnpm dev:mobile          # = expo start in apps/mobile
   ```
   If the phone can't reach the computer (corporate Wi‑Fi, VPN), use a tunnel instead: `pnpm --filter @travelta/mobile exec expo start --tunnel`.
4. Open Expo Go, then **Scan QR code**, and scan the code shown in the terminal.
5. The first launch builds the JavaScript bundle (about 30–60 s). Later reloads are fast. Shake the phone for the developer menu.

On an iPhone, the same steps work with Expo Go from the App Store, scanning the QR code with the Camera app.

Development builds, if Expo Go ever falls behind: `npx expo run:android` needs Android Studio and the SDK, and `npx expo run:ios` needs Xcode.

## What to check on the device

Use the demo account **customer@example.com / Demo@1234**, or the "Quick demo sign-in" button. For each check, mark pass or fail.

| # | Area | Steps | Expected |
|---|---|---|---|
| 1 | Onboarding | Fresh install, then open the app | Four slides with progress dots. Skip, Next and Get started work. Reopening the app goes straight to Home. Profile → "Show the introduction again" replays it. |
| 2 | Registration and verification | Profile → Create account → register | Signed in. Profile shows the "verify your email" card. Verify now shows the code in a demo box; entering it gives "Email verified". |
| 3 | Sign in and SecureStore | Sign in, close the app fully (swipe away), reopen | Still signed in. The token is in the keychain/keystore, not AsyncStorage. Sign out, reopen: signed out. |
| 4 | Forgot password | Sign in screen → Forgot password? → email → Send code → code and new password | "Password changed". The old password fails; the new one works. A wrong code shows "invalid or expired". |
| 5 | Navigation | Tap each tab | Home, Explore, Bookings, Favorites and Profile all open. The bell on Home opens Notifications. The back gesture works. |
| 6 | Home | — | Featured destinations, recent searches (after one search), "Top rated in …" cards and the promo code are shown. |
| 7 | Search, all seven services | Explore → each chip → Search | Results (or a clear empty state) for every service. Sort and the free-cancellation filter work. |
| 8 | Hotel map | Hotels in Luxor → Show map | OpenStreetMap tiles with price pills. Tapping a pill shows a preview card; tapping it opens the hotel. "Show list" returns with the filters kept. |
| 9 | Hotel location | Open a hotel | The Location card shows a map with the hotel pin and nearby places, plus the address, coordinates and distances. Directions opens the browser or maps. |
| 10 | Favourites | Heart a result → Favorites tab | It is listed. Removing it updates the list. |
| 11 | Booking | Add to cart → checkout → card 4242 4242 4242 4242 (or 4000 0000 0000 3220 for 3-D Secure) | Booking confirmed and appears under Bookings. |
| 12 | Trip, voucher, cancellation | Open the trip | Pay now, cancel with a refund preview, and share the voucher as a PDF via the share sheet all work. |
| 13 | Arabic and RTL | Profile → العربية | The whole UI mirrors (tabs, rows, chevrons), Arabic text throughout, and prices formatted correctly. |
| 14 | Dark mode | Profile → Appearance → Dark | All screens are readable, including the map preview card. |
| 15 | Small and large phones and font scaling | System font size set to the largest | No clipped buttons. Touch targets are at least 44 pt. |
| 16 | Offline map | Airplane mode on the map screen | "The base map could not be loaded" notice. The results list still works. |
| 17 | Demo data transfer | Profile → Demo tools → Export, then import that file on the web Demo panel (or the reverse) | The import validates the file (schema version, every row, references) and the same data appears. |

Please send back the table with pass or fail and screenshots of any failure. I'll fix the issues against your results.

## Known limitations

- Web and mobile keep **independent** local datasets. Moving scenarios between them uses JSON export and import (item 17); there is no live sync.
- Maps load Leaflet and the tiles from the internet inside a WebView. Without a connection the app shows the offline notice instead of a map.
