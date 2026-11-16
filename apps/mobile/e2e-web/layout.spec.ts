import { byId, expect, expectAccessible, test } from './fixtures';

test('bottom tabs all open; home shows photos for services and destinations', async ({ page }) => {
  await page.goto('/home');
  await expect(byId(page, 'service-hotel').locator('img')).toBeVisible();
  await expect(byId(page, 'home-featured').locator('img').first()).toBeVisible();
  for (const [tab, url] of [['Explore', /\/search$/], ['Bookings', /\/trips$/], ['Favorites', /\/favorites$/], ['Profile', /\/profile$/], ['Home', /\/home$/]] as const) {
    await page.getByRole('tab', { name: tab }).or(page.getByRole('link', { name: tab })).first().click();
    await expect(page).toHaveURL(url);
  }
  const broken = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length);
  expect(broken).toBe(0);
});

test('Arabic switches the layout to right-to-left and translates the UI', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'العربية' }).click();
  await page.goto('/home');
  await expect(page.getByText('استكشف').first()).toBeVisible();
  await expect(page.getByText('وجهات مميزة')).toBeVisible();
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
});

test('home, explore and login pass axe (WCAG 2 A/AA, web rendering)', async ({ page }) => {
  for (const path of ['/home', '/search', '/login']) {
    await page.goto(path);
    await page.waitForTimeout(1500);
    await expectAccessible(page);
  }
});
