import { byId, expect, signIn, test } from './fixtures';

test('hotel search → results with photos → map with price markers → preview → product + location → book by card → trip', async ({ page }) => {
  await signIn(page);
  await page.goto('/search');
  await byId(page, 'chip-hotel').click();
  await byId(page, 'dest-LXR').click();
  await byId(page, 'run-search').click();
  const results = byId(page, 'mobile-result');
  await expect(results.first()).toBeVisible({ timeout: 30_000 });
  await expect(results.first().locator('img')).toHaveJSProperty('complete', true);

  await byId(page, 'm-show-map').click();
  await expect(byId(page, 'm-results-map')).toBeVisible();
  const pill = page.locator('.tvm-pill').first();
  await expect(pill).toBeVisible({ timeout: 20_000 });
  await pill.click();
  const preview = byId(page, 'm-map-preview');
  await expect(preview).toBeVisible();
  await preview.click();

  await expect(byId(page, 'm-product-photo')).toBeVisible();
  await expect(byId(page, 'm-hotel-location')).toBeVisible();
  await expect(byId(page, 'm-hotel-location').locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 20_000 });
  await byId(page, 'mobile-add').first().click();
  await expect(page).toHaveURL(/\/cart$/);
  await byId(page, 'mobile-go-checkout').click();
  await expect(byId(page, 'm-first-0-0')).toBeVisible({ timeout: 20_000 });
  const firsts = page.locator('[data-testid^="m-first-0-"]');
  for (let k = 0; k < await firsts.count(); k++) {
    await byId(page, `m-first-0-${k}`).fill('Sara');
    await byId(page, `m-last-0-${k}`).fill('Ali');
  }
  await byId(page, 'm-card').fill('4242 4242 4242 4242');
  await page.getByLabel('Expiry').fill('12/29');
  await page.getByLabel('CVC').fill('123');
  await page.getByLabel('Name on card').fill('Sara Ali');
  await byId(page, 'm-submit').click();
  await expect(page).toHaveURL(/\/trip\/[^/?]+/, { timeout: 30_000 });

  await page.goto('/trips');
  await expect(byId(page, 'mobile-trip').first()).toBeVisible();
});

test('favorites: save from results, see it in the Favorites tab', async ({ page }) => {
  await signIn(page);
  await page.goto('/search');
  await byId(page, 'run-search').click();
  await expect(byId(page, 'mobile-result').first()).toBeVisible({ timeout: 30_000 });
  const heart = byId(page, 'm-favorite').first();
  await heart.click();
  await expect(heart).toHaveAttribute('aria-label', /^Remove .* from favorites$/);
  await page.goto('/favorites');
  await expect(byId(page, 'm-favorite-row')).toHaveCount(1);
});

for (const service of ['hotel', 'flight', 'tour', 'visa', 'umrah', 'activity', 'transfer'] as const) {
  test(`search works for ${service}`, async ({ page }) => {
    await page.goto(`/search?service=${service}`);
    await byId(page, `chip-${service}`).click();
    await byId(page, 'run-search').click();
    await expect(byId(page, 'mobile-result').first().or(page.getByText('No results'))).toBeVisible({ timeout: 30_000 });
    await expect(byId(page, 'mobile-result').first()).toBeVisible();
  });
}
