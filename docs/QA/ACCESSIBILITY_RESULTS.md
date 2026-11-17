# Accessibility results

**Tool:** axe-core 4 via `@axe-core/playwright`.

**Tags:** WCAG 2.0 / 2.1 A and AA (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`). Third-party map tiles are excluded. A scan runs once the page has settled: loading skeletons are gone and running entrance animations have finished. Status is from the final run on 17 Nov 2026.

## Automated scans

| Spec | What is scanned | Result |
|---|---|---|
| `a11y/accessibility.spec.ts` | 26 screens. Public (8): landing EN/AR, search results, both sign-ins, registration, forgot password, agency storefront. Admin (6), agency (6), supplier (3), customer (3). | Passed |
| `a11y/interaction.spec.ts` | Profile menu **open**; promo-code dialog **open**; flight offer sheet; checkout traveller step (passports) and payment step; sub-agency compliance page; success toast in **light and dark** | Passed (after fix B5) |
| `responsive/responsive.mobile.spec.ts` | Main screens at phone size in **dark** mode | Passed |
| `responsive/dashboard-controls.spec.ts` | Arabic + dark with the calendar and a select list **open** | Passed |
| Expo Web `layout.spec.ts` | Home, explore and login (react-native-web rendering) | Passed |

## Keyboard and focus (`a11y/interaction.spec.ts`, `services/search-form.spec.ts`, `responsive/dashboard-controls.spec.ts`)

| Behaviour | Result |
|---|---|
| Profile menu opens with Enter, arrow keys move between items, Escape closes and **focus returns to the trigger** | Passed |
| Dialogs **trap focus** (15 Tabs stay inside) and give it back to the opener on Escape | Passed |
| Selects: open with the keyboard, type-ahead, Enter to choose | Passed |
| Date picker: arrow-key grid, disabled days, month/year jump | Passed |
| Search tabs and fields by keyboard; reduced motion respected | Passed |

## Defects

| # | Finding | Status |
|---|---|---|
| B5 | Success toast text 4.25:1 (Sonner's built-in green on its tint), below the 4.5:1 AA minimum | **Fixed.** Toasts use the contrast-tested design tokens. Regression tests in light and dark. |
| B3 | Sub-agency compliance page showed an endless loading state, with no status message for assistive technology | **Fixed.** Explanatory empty state, scanned clean |
| (earlier) | Profile-menu trigger label didn't contain its visible text (WCAG 2.5.3) | Fixed in the account round |

## Limits

- **Automated checks find roughly a third to a half of WCAG issues.** No manual screen-reader pass (VoiceOver or TalkBack) was done in this round.
- **Colour contrast inside images and charts** isn't checked by axe.
