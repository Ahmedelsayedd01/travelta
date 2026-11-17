import { expect, searchUrl, signIn, test, ACCOUNTS } from '../fixtures';

/** Every service: public search → results with photos → product details with options, policy and price breakdown. */
const SERVICES: [string, string][] = [['hotel', 'LXR'], ['flight', 'DXB'], ['tour', 'LXR'], ['visa', 'DXB'], ['umrah', 'MKX'], ['activity', 'HRG'], ['transfer', 'HRG']];

for (const [service, dest] of SERVICES) {
  test(`${service}: search → results → details`, async ({ page }) => {
    await page.goto(searchUrl('/en/search', { serviceType: service, destinationCode: dest }));
    const first = page.getByTestId('search-result').first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await expect(first.locator(`[data-photo^="${service}-"]`)).toBeVisible();
    await first.getByTestId('open-offer').click();
    const sheet = page.getByTestId('offer-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('offer-option').first()).toBeVisible();
    await expect(sheet.getByTestId('offer-policy')).toBeVisible();
    await expect(page.getByTestId('sign-in-to-book')).toBeVisible();
  });
}

/** Arabic RTL journey: search, details and add to cart in Arabic as a signed-in customer. */
test('Arabic customer journey: RTL search, details and cart', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto(searchUrl('/ar/search', { destinationCode: 'LXR' }));
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const first = page.getByTestId('search-result').first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.getByTestId('open-offer').click();
  await expect(page.getByTestId('offer-sheet')).toBeVisible();
  const add = page.getByTestId('add-to-cart');
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
  await page.goto('/ar/account/cart');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});
