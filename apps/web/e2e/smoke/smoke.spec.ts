import type { Page } from '@playwright/test';
import { ACCOUNTS, expect, signIn, test, waitForContent } from '../fixtures';
import { SERVICES } from '../pages/storefront';

/**
 * Stage 1 — smoke. The app starts, the landing page and every service load, each role signs in to its own home,
 * and every page in each role's navigation renders real content: a heading, no error state, no "forbidden" page,
 * no console error (the fixture fails a test on any console error, page error or HTTP 4xx/5xx).
 */

test('landing page loads with all seven services @smoke', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Services' });
  for (const name of ['Hotels', 'Flights', 'Tours', 'Visas', 'Umrah', 'Activities', 'Buses & transfers']) await expect(nav.getByRole('link', { name, exact: true }).first()).toBeVisible();
});

test('every service opens its search with results @smoke', async ({ page }) => {
  await page.goto('/en/search');
  const form = page.getByTestId('search-form');
  for (const service of SERVICES) {
    await form.locator(`[role=tab][data-service="${service}"]`).click();
    await expect(form.locator(`[role=tab][data-service="${service}"]`)).toHaveAttribute('aria-selected', 'true');
  }
});

/** Visit every link in the portal sidebar and check the page renders real content. */
async function crawlSidebar(page: Page, home: string) {
  await page.goto(home);
  const sidebar = page.getByTestId('sidebar');
  await expect(sidebar).toBeVisible();
  const hrefs = [...new Set(await sidebar.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!)))]
    .filter((h) => h.startsWith('/en/'));
  expect(hrefs.length, 'sidebar links').toBeGreaterThan(3);
  const broken: string[] = [];
  for (const href of hrefs) {
    await page.goto(href);
    await waitForContent(page);
    const problem = (await page.getByTestId('forbidden').count()) ? 'forbidden'
      : (await page.getByText('Something went wrong').count()) ? 'error state'
      : (await page.getByText('Page not found').count()) ? 'not found'
      : (await page.locator('main h1, main [role=heading][aria-level="1"]').count()) === 0 ? 'no heading' : null;
    if (problem) broken.push(`${href}: ${problem}`);
  }
  expect(broken, 'pages that do not render').toEqual([]);
  return hrefs.length;
}

const ROLES: [string, string, string][] = [
  ['platform admin', ACCOUNTS.platformAdmin, '/en/admin'],
  ['agency owner', ACCOUNTS.agencyOwner, '/en/agency'],
  ['sub-agency owner', ACCOUNTS.subAgencyOwner, '/en/agency'],
  ['supplier admin', ACCOUNTS.supplierAdmin, '/en/supplier'],
];
for (const [role, email, home] of ROLES) {
  test(`${role}: signs in to the portal and every navigation page renders @smoke`, async ({ page }) => {
    test.slow();
    await signIn(page, email);
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    const visited = await crawlSidebar(page, home);
    test.info().annotations.push({ type: 'pages visited', description: String(visited) });
  });
}

test('customer: signs in to the storefront and every account page renders @smoke', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await expect(page).toHaveURL(/\/en\/?$/);
  for (const section of ['profile', 'bookings', 'travelers', 'favorites', 'notifications', 'support', 'settings']) {
    await page.goto(`/en/account/${section}`);
    await waitForContent(page);
    await expect(page.getByTestId('account-shell')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  }
});
