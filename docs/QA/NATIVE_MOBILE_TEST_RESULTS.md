# Native mobile test results

## Summary

| Target | Status |
|---|---|
| Expo Web (react-native-web in Chrome, Pixel 7 size) | **18 / 18 passed** on 17 Nov 2026 |
| Android device or emulator | **Not tested.** No Android SDK, `adb` or emulator on this machine. |
| iOS device or Simulator | **Not tested.** Xcode isn't installed (`xcrun simctl` unavailable). |
| Native automation (Maestro / Detox) | **Not available.** Maestro isn't installed and the project has no native E2E setup. |

**Expo Web passing doesn't mean the Android or iOS app works.** It runs the same screens and logic through react-native-web, with web replacements (`.web` files) for:
- secure storage;
- maps;
- alerts;
- printing;
- file export;
- locale persistence.

Native modules, gestures, the keyboard, safe areas, push notifications and performance on real hardware are unverified.

## Environment check (17 Nov 2026)

```
$ xcrun simctl list devices
xcrun: error: unable to find utility "simctl", not a developer tool or in PATH
$ which adb emulator maestro
adb not found / emulator not found / maestro not found
$ ls ~/Library/Android/sdk
No such file or directory
```

## Expo Web suite (`pnpm --filter @travelta/mobile e2e:web`)

| Spec | Tests | Covers |
|---|---:|---|
| `onboarding.spec.ts` | 2 | First-launch slides with photos, next, previous and get started; completion persists; skip is remembered |
| `auth.spec.ts` | 4 | Sign in, session survives a reload, sign out; wrong password; register with confirm password and terms, then email verification by code; forgot password with a wrong then right code |
| `booking.spec.ts` | 9 | Search for each of the 7 services. Hotel: results with photos, map with price markers, preview, product with location, card booking, trip. Favourites. |
| `layout.spec.ts` | 3 | Every bottom tab; home photos; Arabic RTL; axe WCAG 2 A/AA on home, explore and login |

Gap (KNOWN_ISSUES K7): the booking flow on Expo Web covers hotels only. The other six services book end to end on the web app, which uses the same backend and contracts.

## How to test on devices

Follow the step-by-step instructions and the 17-row pass/fail checklist in [`docs/MOBILE_TESTING.md`](../MOBILE_TESTING.md):
1. Install Expo Go.
2. Run `pnpm dev:mobile`, or `expo start --tunnel` on restricted networks.
3. Scan the QR code.

Please return the table with pass or fail and screenshots. The failures will then be fixed against those results.
