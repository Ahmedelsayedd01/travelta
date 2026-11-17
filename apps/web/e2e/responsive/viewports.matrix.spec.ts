import type { Locator, Page } from '@playwright/test';
import { ACCOUNTS, expect, expectNoHorizontalOverflow, signIn, test, waitForContent } from '../fixtures';
import { SearchResults } from '../pages/storefront';

/**
 * Device matrix: runs in every viewport project (desktop 1440/1920, tablet 1024×768 / 768×1024, phones 430/390/375).
 * Checks layout, not business logic: no sideways scrolling, popups (selects, calendars, sheets, menus) fully on
 * screen, small-screen navigation, touch-sized primary controls, RTL and dark mode.
 */
async function expectOnScreen(page: Page, locator: Locator, what: string) {
  await expect(locator, what).toBeVisible();
  const vp = page.viewportSize()!;
  // Sheets and drawers slide in: measure once the entrance animation has settled.
  await expect(async () => {
    const box = (await locator.boundingBox())!;
    expect(box.x, `${what}: left edge`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${what}: right edge`).toBeLessThanOrEqual(vp.width + 1);
  }).toPass({ timeout: 5_000 });
}

const isPhone = (page: Page) => page.viewportSize()!.width < 640;
const isTouchSized = async (locator: Locator) => ((await locator.boundingBox())!.height >= 40);

test('landing and search: no sideways scroll; destination list and calendar open on screen', async ({ page }) => {
  await page.goto('/en');
  await waitForContent(page);
  await expectNoHorizontalOverflow(page);
  await page.goto('/en/search');
  const form = page.getByTestId('search-form');
  await expect(form).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await form.getByTestId('select-destination').click();
  await expectOnScreen(page, page.getByTestId('select-destination-list'), 'destination list');
  await page.keyboard.press('Escape');

  await form.getByTestId('date-from').click();
  await expectOnScreen(page, page.getByTestId('date-from-popup'), 'check-in calendar');
  await page.keyboard.press('Escape');

  if (isPhone(page)) expect(await isTouchSized(form.getByTestId('search-submit')), 'search button is touch-sized').toBe(true);
});

test('results and product details fit; Add to cart is reachable', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  const results = await new SearchResults(page).open('hotel');
  await expectNoHorizontalOverflow(page);
  const sheet = await results.openOffer();
  await expectOnScreen(page, sheet.root, 'offer sheet');
  const add = page.getByTestId('add-to-cart');
  await add.scrollIntoViewIfNeeded();
  await expectOnScreen(page, add, 'Add to cart');
  if (isPhone(page)) expect(await isTouchSized(add), 'Add to cart is touch-sized').toBe(true);
});

test('customer account: profile menu on screen, account pages fit', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.getByTestId('profile-menu-trigger').click();
  await expectOnScreen(page, page.getByTestId('profile-menu'), 'profile menu');
  await page.keyboard.press('Escape');
  for (const section of ['profile', 'bookings', 'travelers', 'settings']) {
    await page.goto(`/en/account/${section}`);
    await waitForContent(page);
    await expectNoHorizontalOverflow(page);
  }
});

test('sign-in and registration pages fit', async ({ page }) => {
  for (const path of ['/en/account/login', '/en/account/register', '/en/login']) {
    await page.goto(path);
    await expect(page.locator('input[type=email]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('staff portal: small screens use the menu drawer; large screens the sidebar', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  await waitForContent(page);
  await expectNoHorizontalOverflow(page);
  const wide = page.viewportSize()!.width >= 1024;
  if (wide) {
    await expect(page.getByTestId('sidebar')).toBeVisible();
  } else {
    await expect(page.getByTestId('sidebar')).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog');
    await expectOnScreen(page, drawer, 'navigation drawer');
    await drawer.getByRole('link', { name: 'Bookings' }).click();
    await expect(page).toHaveURL(/\/en\/agency\/bookings$/);
  }
  await page.goto('/en/agency/bookings');
  await waitForContent(page);
  await expectNoHorizontalOverflow(page);
});

test('Arabic + dark: storefront and account mirror without sideways scroll', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/ar/search');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('search-form')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('search-form').getByTestId('date-from').click();
  await expectOnScreen(page, page.getByTestId('date-from-popup'), 'RTL calendar');
  await page.keyboard.press('Escape');
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto('/ar/account/bookings');
  await waitForContent(page);
  await expectNoHorizontalOverflow(page);
});
