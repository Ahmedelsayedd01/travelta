import { expect, test } from './fixtures';

/** Landing page: real, loaded photos for the hero and every service; destinations and popular rows backed by live search. */
test('landing page shows loaded service photos, featured destinations and live popular rows', async ({ page }) => {
  await page.goto('/en');
  const tiles = page.getByTestId('service-tiles').locator('[data-service]');
  await expect(tiles).toHaveCount(7);
  await expect(page.getByTestId('featured-destinations').locator('[data-destination]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('popular-hotel').locator('li').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('popular-umrah').locator('li').first()).toBeVisible({ timeout: 30_000 });
  // Every photo on the page actually decoded (no broken images); each service tile uses its own photo.
  await page.evaluate(async () => { for (const img of Array.from(document.images)) { img.loading = 'eager'; if (!img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; }); } });
  const broken = await page.evaluate(() => Array.from(document.images).filter((i) => i.naturalWidth === 0).map((i) => i.currentSrc || i.src));
  expect(broken).toEqual([]);
  const pairs = await tiles.evaluateAll((els) => els.map((e) => [e.getAttribute('data-service'), e.querySelector('[data-photo]')?.getAttribute('data-photo') ?? '']));
  expect(new Set(pairs.map(([, p]) => p)).size).toBe(7);
  for (const [service, photo] of pairs) expect(photo, `${service} tile`).toMatch(new RegExp(`^${service}-`));
  // Destination cards open a hotel search for that destination.
  await page.getByTestId('featured-destinations').locator('[data-destination]').first().click();
  await expect(page).toHaveURL(/\/search\?s=/);
});

test('photo credits list every image with its licence', async ({ page }) => {
  await page.goto('/en');
  await page.getByTestId('credits-link').click();
  await expect(page.getByTestId('credits-list').locator('li')).toHaveCount(40);
  await expect(page.getByTestId('credits-list')).toContainText('CC BY-SA 4.0');
});
