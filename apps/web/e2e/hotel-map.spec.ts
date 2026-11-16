import { expect, hittablePricePill, searchUrl, test } from './fixtures';

/** Scenario B (desktop) — results and map stay linked both ways; the hotel page shows its location and surroundings. */
test('hotel results on an interactive map with two-way selection and hotel location details', async ({ page }) => {
  await page.goto(searchUrl('/en/search', { destinationCode: 'LXR' }));
  await expect(page.getByTestId('search-result').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('view-split').click();
  const map = page.getByTestId('results-map');
  await expect(map).toHaveAttribute('data-ready', 'true');
  const markers = map.locator('[data-marker-kind=price]');
  const cards = page.getByTestId('search-results').getByTestId('search-result');
  await expect(markers).toHaveCount(await cards.count());

  // Marker → card. Price pills can overlap, so click where a pill is drawn, like a user, and follow whichever was hit.
  const pill = await hittablePricePill(page, '[data-testid=results-map]');
  await page.mouse.click(pill.x, pill.y);
  const selectedMarker = map.locator('.tv-map-marker.is-selected');
  await expect(selectedMarker).toHaveCount(1);
  const key = await selectedMarker.getAttribute('data-marker-id');
  await expect(page.locator(`[data-testid=search-results] [data-testid=search-result][data-key="${key}"]`)).toHaveAttribute('data-selected', 'true');

  // Card → marker.
  const second = cards.and(page.locator(`:not([data-key="${key}"])`)).first();
  const secondKey = await second.getAttribute('data-key');
  await second.getByTestId('show-on-map').click();
  await expect(map.locator(`[data-marker-id="${secondKey}"]`)).toHaveClass(/is-selected/);
  await expect(second).toHaveAttribute('data-selected', 'true');

  // Filters survive switching views.
  await page.getByRole('checkbox', { name: 'Free cancellation only' }).click();
  await expect(page.locator('section[aria-busy=true]')).toHaveCount(0);
  const filtered = await cards.count();
  await page.getByTestId('view-map').click();
  await expect(page.getByTestId('map-view')).toBeVisible();
  await expect(page.getByTestId('map-view').locator('[data-marker-kind=price]')).toHaveCount(filtered);
  await page.getByTestId('back-to-list').click();

  // Hotel details: location, coordinates, nearby places, directions.
  await cards.first().getByTestId('open-offer').click();
  const location = page.getByTestId('hotel-location');
  await expect(location).toBeVisible();
  await expect(location.getByTestId('hotel-coords')).toHaveText(/^\d+\.\d{5}, \d+\.\d{5}$/);
  await expect(location.getByTestId('nearby-places')).toContainText('Airports');
  await expect(location.getByTestId('nearby-places')).toContainText(/Temple|Karnak|Valley/);
  await expect(location.getByTestId('directions-link')).toHaveAttribute('href', /openstreetmap\.org\/directions/);
  await expect(location.getByTestId('hotel-map').locator('[data-marker-kind=pin]')).toHaveCount(1);
});

test('the map can drive the search ("search as I move the map") and shows a useful empty state', async ({ page }) => {
  await page.goto(searchUrl('/en/search', { destinationCode: 'LXR' }));
  await expect(page.getByTestId('search-result').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('view-split').click();
  const map = page.getByTestId('results-map');
  await expect(map).toHaveAttribute('data-ready', 'true');
  await page.getByRole('checkbox', { name: 'Search as I move the map' }).click();
  // Zoom far in on an empty spot of desert west of the Nile.
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + 12, box.y + box.height - 60);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(250); }
  await expect(page.getByTestId('map-empty').or(page.getByText('No results match your filters'))).toBeVisible();
});
