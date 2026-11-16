import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'Demo@1234';
const IGNORED = [/tile\.openstreetmap\.org/, /Failed to load resource/];

/**
 * Every test: fresh context = fresh in-browser demo data. Onboarding is marked done unless `onboarding: true`.
 * Fails on console errors and uncaught page errors.
 */
export const test = base.extend<{ consoleErrors: string[]; onboarding: boolean }>({
  onboarding: [false, { option: true }],
  page: async ({ page, onboarding }, use) => {
    if (!onboarding) await page.addInitScript(() => { try { localStorage.setItem('travelta:onboarded', '1'); } catch { /* ignore */ } });
    await use(page);
  },
  consoleErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
    expect(errors, 'browser console errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

export const byId = (page: Page, id: string) => page.locator(`[data-testid="${id}"]`);

/** Demo customer sign-in through the real login form. */
export async function signIn(page: Page, email = 'customer@example.com', password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await byId(page, 'm-login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

export async function expectAccessible(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.leaflet-tile-pane').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), 'axe violations').toEqual([]);
}
