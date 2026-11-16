# Monorepo Architecture

## Layout

```text
travelta/
├── apps/
│   ├── web/                    # Next.js: admin, agency, supplier portals + B2C storefront
│   └── mobile/                 # Expo: B2C customer app
├── packages/
│   ├── contracts/              # Domain types & API contracts (DTOs, enums, error/response envelopes, endpoint catalogue)
│   ├── schemas/                # Zod schemas (source of truth for DTO shapes + form validation); contracts re-export inferred types
│   ├── domain/                 # Pure business rules: pricing engine, FX lock, tax, state machines, ledger posting, permission evaluation, KYC rules, instalments
│   ├── mock-server/            # Simulated backend: in-memory DB + persistence adapter, seed data, repositories, services, supplier adapters, auth, latency/fault injection
│   ├── api-client/             # Typed client API (`api.bookings.create(...)`) over a Transport; MockTransport now, HttpTransport later
│   ├── i18n/                   # en/ar ICU JSON resources per namespace + locale metadata (dir, number/date formats)
│   ├── design-tokens/          # Colors, typography, spacing, radii, shadows → CSS vars (web) + TS object (mobile)
│   ├── shared/                 # Framework-agnostic utils: money formatting, dates, ids, Result type, pagination helpers
│   ├── eslint-config/
│   └── tsconfig/
├── docs/
├── infrastructure/             # Placeholder: future Docker/CI notes only (no deployable infra in this phase)
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

### Additions compared with the suggested structure, and why
| Package | Reason |
|---|---|
| `domain` | Rule 4 says "do not duplicate business rules across web and mobile". The pricing, state-machine, ledger and permission rules must live in one place with no framework imports. Later NestJS imports the **same package**, so the rules move to the server without a rewrite. |
| `mock-server` | The prompt's per-feature `repositories/mock-*.repository.ts` would be duplicated in web and mobile. Putting the simulated backend in one package gives both apps identical behaviour and seed data, and it is the single module deleted when the real API arrives. |

## Dependency rules (enforced with ESLint `import/no-restricted-paths` / package boundaries)

```text
apps/web, apps/mobile ──► api-client ──► contracts ◄── schemas
        │                    │
        │                    └── (MockTransport) ──► mock-server ──► domain ──► contracts, shared
        ├──► schemas, i18n, design-tokens, shared, domain (pure display helpers only, e.g. status labels/allowed actions)
        ✗  apps never import mock-server directly (only via api-client's transport factory)
        ✗  domain never imports React, Next, RN, mock-server, or storage
        ✗  web components never imported by mobile and vice versa
```

`domain` is allowed in apps for **presentational** rule use: showing which actions a status allows, or a live price preview in the manual-booking wizard. The authoritative calculation still runs inside `mock-server` (later the API), and its result is what gets displayed and stored.

## Package naming
`@travelta/contracts`, `@travelta/schemas`, `@travelta/domain`, `@travelta/mock-server`, `@travelta/api-client`, `@travelta/i18n`, `@travelta/design-tokens`, `@travelta/shared`, `@travelta/eslint-config`, `@travelta/tsconfig`.

Internal packages ship **TypeScript source** (`"exports": "./src/index.ts"`). Next uses `transpilePackages` and Metro resolves workspaces. There is no per-package build step in the prototype, which keeps dev loops fast. Turbo still runs `typecheck`, `lint` and `test` per package.

## Turbo pipeline
| Task | Depends on | Cached |
|---|---|---|
| `typecheck` | `^typecheck` | yes |
| `lint` | — | yes |
| `test` | `^typecheck` | yes |
| `build` (web only) | `^typecheck` | yes |
| `dev` | — | no, persistent |

Root scripts: `pnpm dev:web`, `pnpm dev:mobile`, `pnpm check` (typecheck + lint + test), `pnpm test:e2e`.

## Metro + pnpm (verified in Milestone 1)
- Expo SDK 58 configures Metro for monorepos automatically. There's no custom `metro.config.js`.
- pnpm's default **isolated** linker works. `nodeLinker: hoisted` isn't needed.
- Workspace packages that export TypeScript source (`"exports": { ".": "./src/index.ts" }`) resolve in both Metro and Next 16 (Turbopack transpiles workspace packages automatically).
- pnpm 12 blocks dependency build scripts unless they're approved. `pnpm-workspace.yaml → allowBuilds` denies `@parcel/watcher` and `@swc/core` (pulled in by next-intl's tooling). Both use prebuilt binaries.

## Pinned toolchain decisions
| Tool | Version | Why |
|---|---|---|
| TypeScript | 6.0.3 | 7.x (native compiler) is outside typescript-eslint's supported range (`<6.1`); 6.0.3 is also Expo SDK 58's pinned version |
| ESLint | 9.39.5 | `eslint-plugin-react` (used by both eslint-config-next and eslint-config-expo) doesn't support ESLint 10 yet |
| React | 19.3.0 (web + mobile) | Exact version Expo SDK 58 pins. One React version across the monorepo avoids duplicate-React runtime errors. |
