# Design System

Approved colour direction (decision on Q3, 15 Nov 2026). All values live in `@travelta/design-tokens`. Web consumes them as CSS variables mapped into Tailwind v4 `@theme`. Mobile consumes them as a typed TS object. **No component, in any portal or app, may use a raw hex value.** ESLint (web) and a unit test on the token import graph (mobile) enforce this.

## 1. Brand palette (approved)
| Role | Token | Hex |
|---|---|---|
| Primary: Deep Teal | `brand.primary` | `#0F766E` |
| Secondary: Dark Navy | `brand.secondary` | `#102A43` |
| Accent: Turquoise | `brand.accent` | `#14B8A6` |
| Background: Light Neutral | `bg.canvas` | `#F8FAFC` |
| Surface: White | `bg.surface` | `#FFFFFF` |
| Highlight: Amber | `brand.highlight` | `#F59E0B` |
| Text: Dark Slate | `fg.default` | `#1E293B` |

### Scales (derived)
- **Teal**: 50 `#F0FDFA` · 100 `#CCFBF1` · 200 `#99F6E4` · 300 `#5EEAD4` · 400 `#2DD4BF` · 500 `#14B8A6` (accent) · 600 `#0D9488` · **700 `#0F766E` (primary)** · 800 `#115E59` (hover/pressed) · 900 `#134E4A`
- **Navy**: 50 `#F0F4F8` · 100 `#D9E2EC` · 200 `#BCCCDC` · 300 `#9FB3C8` · 400 `#829AB1` · 500 `#627D98` · 600 `#486581` · 700 `#334E68` · 800 `#243B53` · **900 `#102A43` (secondary)**
- **Slate (neutrals)**: 50 `#F8FAFC` · 100 `#F1F5F9` · 200 `#E2E8F0` · 300 `#CBD5E1` · 400 `#94A3B8` · 500 `#64748B` · 600 `#475569` · 700 `#334155` · 800 `#1E293B` · 900 `#0F172A`
- **Amber**: 100 `#FEF3C7` · 400 `#FBBF24` · 500 `#F59E0B` (highlight) · 700 `#B45309`

## 2. Semantic tokens (light / dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| `bg.canvas` | `#F8FAFC` | `#0B1220` | App background |
| `bg.surface` | `#FFFFFF` | `#111A2E` | Cards, tables, dialogs |
| `bg.surface-raised` | `#FFFFFF` | `#17223A` | Popovers, menus |
| `bg.subtle` | `#F1F5F9` | `#17223A` | Table header, zebra, inputs disabled |
| `bg.nav` | `#102A43` | `#0A1628` | Portal sidebar (all portals) |
| `bg.nav-active` | `#0F766E` | `#115E59` | Active nav item |
| `fg.on-nav-active` | `#FFFFFF` | `#FFFFFF` | Text on the active nav item (added in M2: the contrast test showed `nav-fg` on teal fails AA) |
| `border.default` | `#E2E8F0` | `#24324D` | |
| `border.strong` | `#CBD5E1` | `#334E68` | Inputs |
| `fg.default` | `#1E293B` | `#E2E8F0` | Body text |
| `fg.muted` | `#475569` | `#94A3B8` | Secondary text |
| `fg.subtle` | `#64748B` | `#829AB1` | Placeholders, captions (≥14px only) |
| `fg.on-nav` | `#D9E2EC` | `#D9E2EC` | Sidebar text |
| `action.primary` | `#0F766E` | `#2DD4BF` | Primary buttons and links |
| `action.primary-hover` | `#115E59` | `#5EEAD4` | |
| `fg.on-primary` | `#FFFFFF` | `#0B1220` | Text on primary |
| `action.secondary` | `#102A43` | `#D9E2EC` | Secondary solid buttons |
| `fg.on-secondary` | `#FFFFFF` | `#102A43` | |
| `accent` | `#14B8A6` | `#14B8A6` | Fills, charts, progress, selected chips, focus ring. **Text on it is navy, never white.** |
| `highlight` | `#F59E0B` | `#FBBF24` | Deals, "best price", attention badges. **Text on it is `#1E293B`.** |
| `focus.ring` | `#14B8A6` (2px + 2px offset) | `#2DD4BF` | |
| `status.success` | `#15803D` | `#4ADE80` | |
| `status.warning` | `#B45309` | `#FBBF24` | |
| `status.danger` | `#B91C1C` | `#F87171` | |
| `status.info` | `#1D4ED8` | `#60A5FA` | |
| `status.*-bg` | 100-level tints | 15% alpha of the dark fg | Badge/alert backgrounds |

### Contrast verification (WCAG 2.1, measured)
| Pair | Ratio | Result |
|---|---|---|
| White on primary `#0F766E` | 5.47 | AA ✓ (body + buttons) |
| Primary `#0F766E` on canvas `#F8FAFC` (links) | 5.23 | AA ✓ |
| Primary on teal-100 `#CCFBF1` (badges) | 4.86 | AA ✓ |
| White on navy `#102A43` | 14.64 | AAA ✓ |
| Dark slate on canvas | 13.98 | AAA ✓ |
| `fg.muted #475569` on canvas | 7.24 | AAA ✓ |
| `fg.subtle #64748B` on white | 4.76 | AA ✓ |
| Navy on accent `#14B8A6` | 5.88 | AA ✓ |
| **White on accent `#14B8A6`** | **2.49** | ✗, so it's forbidden |
| Dark slate on amber `#F59E0B` | 6.81 | AA ✓ |
| **White on amber** | **2.15** | ✗, so it's forbidden |
| Dark: `#0B1220` on `#2DD4BF` (primary button) | 10.06 | AAA ✓ |
| Dark: `#E2E8F0` on `#0B1220` | 15.19 | AAA ✓ |
| Dark: `#94A3B8` on `#111A2E` | 6.76 | AA ✓ |
| Status colours on white (success/warning/danger/info) | 5.02 / 5.02 / 6.47 / 6.70 | AA ✓ |

These pairs are a unit test in `design-tokens` (`contrast.test.ts`), so a token change that breaks AA fails CI.

## 3. Consistency across portals
- **All three back-office portals (Admin, Agency, Supplier) share the same shell**: navy sidebar, white or surface content, teal primary actions. The portal is identified by a label chip and an icon in the sidebar header, **not by a different colour**.
- **Storefront** (Travelta Direct and mobile): white/canvas surfaces, teal CTAs, navy footer and hero overlays, amber for deals.
- **Agency-branded storefronts** override only `storefront.brand-primary` and `storefront.brand-accent`, scoped to the storefront subtree. The override is checked on save:
  - If white text on the chosen primary is below 4.5:1, the system switches `fg.on-primary` to dark slate automatically.
  - If neither colour reaches 4.5:1, the save is refused with an explanation.
  - Status and semantic colours can't be overridden.

## 4. Typography
| | Latin (en) | Arabic (ar) |
|---|---|---|
| Family | Inter | IBM Plex Sans Arabic |
| Numerals | Tabular figures (`font-variant-numeric: tabular-nums`) for money, tables and dates | Western digits by default (business data); user preference for Arabic-Indic digits in a later iteration |

Scale (px / line-height): `xs 12/16` · `sm 14/20` · `base 16/24` · `lg 18/28` · `xl 20/28` · `2xl 24/32` · `3xl 30/36` · `4xl 36/40`. Weights: 400 body, 500 labels, 600 headings and buttons, 700 display only. Arabic gets +2px line-height on body sizes for diacritics. Mobile uses the same scale in dp, with Dynamic Type/fontScale respected up to 1.3×.

## 5. Spacing, radii, elevation
- **Spacing**: 4px base: `0.5=2 · 1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=48 · 16=64`. Page gutter 16 (mobile) / 24 (tablet) / 32 (desktop).
- **Radii**: `sm 6` (badges, inputs-sm) · `md 8` (inputs, buttons) · `lg 12` (cards) · `xl 16` (dialogs, mobile sheets) · `full`.
- **Borders**: 1px `border.default`; 2px focus ring.
- **Shadows (light)**: `xs 0 1px 2px rgb(15 23 42/.05)` · `sm 0 1px 3px rgb(15 23 42/.08), 0 1px 2px rgb(15 23 42/.04)` · `md 0 4px 12px rgb(15 23 42/.08)` · `lg 0 12px 32px rgb(15 23 42/.12)`. **Dark**: shadows are reduced and elevation is shown through `bg.surface-raised` and borders.
- **Motion**: 150 ms (hover/press), 200 ms (popover), 250 ms (sheet/dialog), ease-out. `prefers-reduced-motion` respected.
- **Breakpoints (web)**: `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`.

## 6. Components (web ⟷ mobile equivalents; same tokens, platform-native behaviour)
| Component | Variants / rules |
|---|---|
| Button | `primary` (teal), `secondary` (navy), `outline`, `ghost`, `danger`, `link`. Sizes sm 32 / md 40 / lg 48 (mobile min touch 44). Loading state keeps width. Icon-only needs `aria-label`. |
| Input, Textarea, Select, Combobox, DatePicker, DateRange, Phone, Money input, File upload | Label above. Helper or error text below (`aria-describedby`). Error = danger border + icon + text. Required marker `*`. Money input shows currency and stores minor units. |
| Checkbox, Radio, Switch, Segmented control | Segmented control for `% / fixed` markup toggles. |
| Form layout | 1 column on mobile, 2 on desktop. Sections with headings. Sticky footer actions on long forms and wizards. Stepper for wizards. |
| Table (DataTable) | Header `bg.subtle`, row height 44 (compact 36). Numeric columns end-aligned with tabular figures. Sticky header. Column visibility. Pagination. Row actions menu. Empty, error and skeleton rows. On mobile widths it becomes stacked cards. |
| Card, StatCard | `lg` radius, `sm` shadow. StatCard shows value, delta (success/danger with an arrow icon, not colour alone) and sparkline (accent). |
| Badge / StatusBadge | Tinted background + strong foreground + dot. One mapping table: pending → warning, confirmed → info, vouchered → primary (teal), travelled → success, cancelled/rejected → danger, no_show → neutral; KYC and payment statuses mapped the same way. A **DEMO** badge uses amber background with slate text. |
| Price breakdown | A waterfall list (see `PRICING_ENGINE.md §8`). Each line has a label, the rule chip (click → rule) and an amount. Hidden lines follow the viewer's audience. |
| Navigation | Web: collapsible sidebar (navy), topbar (search, org switcher, locale, theme, notifications, user), breadcrumbs. Mobile: bottom tabs (5) + stack headers. RTL mirrors sidebar side and chevrons. |
| Tabs, Accordion, Dialog, Sheet/Drawer, Popover, Tooltip, Toast (sonner / mobile toast), ConfirmDialog (destructive actions use a danger button and restate the object name), Skeleton, EmptyState (illustration icon, title, text, CTA), ErrorState (retry), Kanban (drag + keyboard menu), Timeline, Stepper, Avatar, Calendar grid (availability) | |

## 7. Theming implementation (built in Milestone 2)
- `packages/design-tokens/src/*.ts` is the source. `tokens.css` (`--tv-*` theme values for light, dark and OS preference) and `theme.css` (Tailwind `@theme` mapping) are generated by a Vitest test that fails when they're stale (`pnpm --filter @travelta/design-tokens generate` to update).
- Web showcase: `/[locale]/design-system`. Mobile showcase: `design-system` route.

- Web: `data-theme="light|dark"` on `<html>`, defaulting to `prefers-color-scheme`. The user toggle is persisted. Tokens are CSS variables, and Tailwind classes reference the variables (`bg-surface`, `text-fg-muted`, `bg-action-primary`).
- Mobile: `useColorScheme()` + a user override. `ThemeProvider` supplies `tokens[scheme]`.
- Charts use a fixed categorical order (teal-700, navy-600, accent, amber-500, teal-300, navy-300), checked against both themes.
