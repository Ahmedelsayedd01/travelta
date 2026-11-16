# Tech Stack

Exact versions get pinned in Milestone 1. We'll use the latest stable release of each library at that point, checked against its docs; no ranges like `^x` for frameworks.

## Monorepo
| Tool | Purpose |
|---|---|
| pnpm workspaces | Package management, `workspace:*` links |
| Turborepo | Task graph: `build`, `dev`, `typecheck`, `lint`, `test`, with caching |
| TypeScript (strict, `noUncheckedIndexedAccess`) | All packages and apps |
| ESLint (flat config) + Prettier | Shared in `packages/eslint-config` |
| Vitest | Unit tests for `domain`, `mock-server`, `schemas`, `api-client` |

## Web: `apps/web`
| Library | Why |
|---|---|
| Next.js (App Router) + React | Required. The team already ships Next 16 + next-intl in `/Fareq/fareq`. |
| Tailwind CSS v4 | Required. Tokens come from `packages/design-tokens` as CSS variables. |
| shadcn/ui-style component system (copied source, Radix/Base UI primitives) | Accessible primitives we own. Matches the team's existing project. |
| TanStack Query | Async state over the mock API (cache, invalidation, loading/error states). It survives the swap to HTTP unchanged. |
| TanStack Table | Sorting, filtering and pagination on the dense admin tables |
| Zustand | Session, active tenant, locale/currency, UI prefs, cart draft |
| React Hook Form + Zod (`@hookform/resolvers`) | Forms, using the shared schemas |
| next-intl | App Router-native i18n with locale segments (`/en`, `/ar`), ICU messages |
| Recharts | Report and dashboard charts |
| lucide-react | Icons |
| sonner | Toasts |
| date-fns | Date maths (nights, due dates, expiry windows) |
| idb-keyval | Tiny IndexedDB wrapper for mock-DB persistence (localStorage's ~5 MB limit is too small for ledger plus inventory) |
| Playwright | E2E flows |

## Mobile: `apps/mobile`
| Library | Why |
|---|---|
| Expo (managed) + React Native + Expo Router | Required |
| TanStack Query, Zustand, React Hook Form + Zod | Same patterns as web |
| i18next + react-i18next + i18next-icu | Required option. ICU, so it reads the **same JSON files** as next-intl. |
| expo-localization | Device locale |
| expo-secure-store | Simulated session token |
| @react-native-async-storage/async-storage | Mock-DB persistence |
| expo-notifications | Local notifications for simulated events (confirmation, payment due) |
| expo-print / expo-sharing | Voucher PDF generation and share |
| jest-expo + React Native Testing Library | Tests |

## Shared packages
`contracts`, `schemas` (Zod), `domain` (pure business rules), `mock-server` (simulated backend), `api-client`, `i18n`, `design-tokens`, `shared` (utils), `eslint-config`, `tsconfig`. See `MONOREPO_ARCHITECTURE.md`.

## Future backend (reference only — not built in this phase)
NestJS · PostgreSQL · Prisma · Redis · BullMQ · REST (OpenAPI) · WebSockets. See `FUTURE_BACKEND_ARCHITECTURE.md`.

## Deliberately not added
- No Redux, MobX or a second state library.
- No MSW. The mock server is called in process through the api-client transport, which is simpler and works the same on React Native.
- No NativeWind or other mobile UI kit. We use `StyleSheet` with design tokens, which means fewer dependencies and full control over RTL.
- No moment/lodash. date-fns and native code cover it.
- No decimal library unless needed. Money is handled as **integer minor units** (see `BUSINESS_RULES.md §Money`).
