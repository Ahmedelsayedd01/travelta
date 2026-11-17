import { expect, expectNoHorizontalOverflow, hittablePricePill, searchUrl, test } from '../fixtures';

/** Scenario B on a phone — "Show map" opens a full map, tapping a price previews the hotel, "Show list" returns. */
test('mobile hotel map: show map, tap a marker for a preview card, back to the list', async ({ page }) => {
  await page.goto(searchUrl('/en/search', { destinationCode: 'LXR' }));
  await expect(page.getByTestId('search-result').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('view-split')).toBeHidden();
  await page.getByTestId('view-map').click();
  const view = page.getByTestId('map-view');
  await expect(view).toBeVisible();
  await expect(view.getByTestId('results-map')).toHaveAttribute('data-ready', 'true');
  await expectNoHorizontalOverflow(page);
  // Tap where a price pill is drawn (pills can overlap); the tapped hotel's card appears as a preview.
  const pill = await hittablePricePill(page, '[data-testid=map-view] [data-testid=results-map]');
  await page.touchscreen.tap(pill.x, pill.y);
  const selected = view.locator('.tv-map-marker.is-selected');
  await expect(selected).toHaveCount(1);
  const key = await selected.getAttribute('data-marker-id');
  await expect(view.locator(`[data-testid=search-result][data-key="${key}"]`)).toBeVisible();
  await page.getByTestId('back-to-list').click();
  await expect(page.getByTestId('search-results')).toBeVisible();
});
