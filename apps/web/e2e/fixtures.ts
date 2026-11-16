import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

/** Seeded demo accounts (see README → Demo accounts). One password for all of them. */
export const DEMO_PASSWORD = 'Demo@1234';
export const ACCOUNTS = {
  platformAdmin: 'admin@travelta.demo',
  agencyOwner: 'owner@nilehorizon.demo',
  /** A different top-level agency (not related to Nile Horizon). */
  otherAgencyOwner: 'owner@redsea.demo',
  subAgencyOwner: 'owner@deltagate.demo',
  supplierAdmin: 'supplier@pharaohstays.demo',
  customer: 'customer@example.com',
} as const;

/** Console noise that is not an application error (map tiles are third-party images and may be offline). */
const IGNORED_CONSOLE = [/tile\.openstreetmap\.org/, /Failed to load resource.*(png|tile)/i];

type Fixtures = { consoleErrors: string[] };

export const test = base.extend<Fixtures>({
  consoleErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    // HTTP failures are reported with their URL (the console only says "Failed to load resource").
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400 && !IGNORED_CONSOLE.some((x) => x.test(r.url()))) errors.push(`HTTP ${r.status()} ${r.url()}`); });
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
    expect(errors, 'browser console errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

/** Sign in through the real form (business portal or storefront account). */
export async function signIn(page: Page, email: string, audience: 'staff' | 'customer' = 'staff', password = DEMO_PASSWORD) {
  const loginPath = audience === 'staff' ? '/en/login' : '/en/account/login';
  // Switching users: drop the current session first (the login page redirects signed-in users away).
  if (page.url().startsWith('http')) { await signOut(page); }
  await page.goto(loginPath);
  const form = page.locator('form').filter({ has: page.locator('input[type=password]') });
  await form.locator('input[type=email]').fill(email);
  await form.locator('input[type=password]').fill(password);
  await form.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/** Sign out through the real button when it's on screen (revokes the server session); otherwise drop the stored session. */
export async function signOut(page: Page) {
  const button = page.getByRole('button', { name: 'Sign out' }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  }
  await page.evaluate(() => { try { localStorage.removeItem('travelta:session'); } catch { /* storage blocked */ } });
}

/** Wait until the page shows real content: no loading skeletons left (the mock API runs in the browser, so networkidle is not enough). */
export async function waitForContent(page: Page) {
  await expect(page.locator('main, [role=main]').first()).toBeVisible();
  await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 30_000 });
}

/** WCAG 2.1 A/AA scan of the loaded page. Map tiles are third-party imagery, excluded from the scan. */
export async function expectAccessible(page: Page, opts: { exclude?: string[] } = {}) {
  await waitForContent(page);
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.leaflet-tile-pane');
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  const result = await builder.analyze();
  const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, 'axe-core WCAG 2.1 AA violations').toEqual([]);
}

/** The page must not scroll sideways (phone widths). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1);
}

/** Pick the first destination option whose value is the IATA-like code (selects use destination ids). */
export async function chooseDestination(page: Page, scope: string, code: string) {
  const select = page.locator(`${scope} select[name=destination]`);
  await expect(select.locator('option').nth(1)).toBeAttached({ timeout: 20_000 });
  await select.selectOption(code);
}

/** Deep link to search results (criteria live in `?s=`); omitted fields use the form defaults. */
export function searchUrl(path: string, criteria: { serviceType?: string; destinationCode: string; from?: string; to?: string }) {
  return `${path}?s=${encodeURIComponent(JSON.stringify({ serviceType: 'hotel', ...criteria }))}`;
}

/**
 * Centre of the first price pill inside `scope` that a pointer can actually hit (on screen, not covered by another
 * pill or control) — what a user would click or tap.
 */
export async function hittablePricePill(page: Page, scope: string): Promise<{ x: number; y: number }> {
  await page.locator(scope).scrollIntoViewIfNeeded();
  const point = await page.evaluate((sel) => {
    for (const pill of document.querySelectorAll<HTMLElement>(`${sel} .tv-map-price`)) {
      const r = pill.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      if (document.elementFromPoint(x, y)?.closest('.tv-map-marker') === pill.closest('.tv-map-marker')) return { x, y };
    }
    return null;
  }, scope);
  expect(point, 'a visible, unobstructed price marker').not.toBeNull();
  return point!;
}
