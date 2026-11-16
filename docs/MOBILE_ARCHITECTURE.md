# Mobile Architecture: `apps/mobile` (Expo, B2C)

## 1. Scope
B2C customer app for iOS and Android. Agency and supplier operations stay on the web this phase. The proposal names no mobile-only B2B workflow.

## 2. Structure

```text
apps/mobile/
├── src/app/                              # Expo Router (file-based; SDK 58 convention — routes live in src/app)
│   ├── _layout.tsx                       # Providers: QueryClient, i18n, MockServer boot, theme, RTL
│   ├── (onboarding)/welcome.tsx, intro.tsx
│   ├── (auth)/login.tsx, register.tsx, forgot-password.tsx
│   ├── (tabs)/_layout.tsx                # Home · Search · Trips · Notifications · Profile
│   │   ├── index.tsx                     # Home & discovery
│   │   ├── search.tsx
│   │   ├── trips/index.tsx               # Booking history
│   │   ├── notifications.tsx
│   │   └── profile/index.tsx, edit.tsx, settings.tsx (language, currency)
│   ├── search/[service]/results.tsx, filters.tsx (modal)
│   ├── product/[service]/[id].tsx
│   ├── cart.tsx
│   ├── checkout/travellers.tsx, payment.tsx, review.tsx
│   ├── confirmation/[ref].tsx
│   ├── trips/[ref].tsx, trips/[ref]/voucher.tsx, trips/[ref]/cancel.tsx
│   └── support/index.tsx, ticket/[id].tsx, faq.tsx
└── src/  (non-route code, next to src/app)
    ├── features/<feature>/{components,hooks,forms,utils}   # search, product, cart, checkout, bookings, vouchers, profile, notifications, support
    ├── components/ui/        # Mobile-specific: Button, TextField, Select sheet, DateRangeSheet, Card, Badge, Skeleton, EmptyState, Toast, BottomSheet, Stepper
    ├── services/             # Platform services: storage adapter (AsyncStorage), secure session (SecureStore), local notifications, PDF/share
    ├── hooks/                # useSession, useDirection, useCurrency
    ├── store/                # Zustand: session, preferences, onboarding-seen
    └── lib/                  # api instance (MockTransport + AsyncStorage persistence), i18n init, theme from tokens
```

## 3. Shared vs. mobile-specific
| Shared (packages) | Mobile only |
|---|---|
| contracts, schemas, domain, api-client, mock-server, i18n JSON, design tokens, shared utils | All components, navigation, gestures, persistence adapter, notifications, PDF/share |

## 4. Persistence and session
- The mock DB uses the same `@travelta/mock-server` with an **AsyncStorage persistence adapter** (namespaced key, versioned, debounced writes).
- The session token (an opaque mock JWT) is stored in **SecureStore**. On launch the app restores the session and validates it against the mock auth service.
- Web and mobile hold **separate** datasets, because each device has its own local DB. This is acceptable for a prototype; see risks.

## 5. i18n and RTL
- i18next + i18next-icu loading `@travelta/i18n` resources.
- A language change calls `I18nManager.allowRTL()` and `I18nManager.forceRTL()`, then `reloadAppAsync()` from `expo`. (`expo-updates` `reloadAsync` was rejected because it doesn't work in development or Expo Go.) The native RTL flag persists the choice, and on first launch the device language decides. React Native needs a reload to flip layout direction. The UI warns the user before reloading (M23).
- Components use `start`/`end` style props (`marginStart`, `paddingEnd`) and mirror directional icons.

## 6. Notifications (simulated)
Mock-server events (`booking.confirmed`, `voucher.issued`, `instalment.due_soon`, `booking.cancelled`) go into the in-app notification centre. When permission is granted they also fire **local** notifications through `expo-notifications`. No push token is registered with any server.

## 7. Payments (simulated)
The card form validates format and Luhn only. Test cards decide the outcome: `4242…` succeeds, `4000 0000 0000 0002` is declined, `4000 0000 0000 3220` gets a simulated 3-D Secure step. Wallet and "pay later" options follow the storefront rules. Every payment screen shows "Simulated payment — no money is charged".

## 8. Quality bar
Test on an iOS simulator and an Android emulator in both locales. Check large text sizes, safe areas and keyboard avoidance on forms. Lists use FlatList virtualisation. Every list screen has skeleton, empty and error states.
