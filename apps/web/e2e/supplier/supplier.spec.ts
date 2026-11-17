import type { Page } from '@playwright/test';
import { ACCOUNTS, chooseOption, expect, nextPersist, signIn, test } from '../fixtures';
import { isoDays } from '../factories/data';
import { pickDate } from '../pages/controls';
import { SearchResults } from '../pages/storefront';

/** Supplier perspective: its own products and rates, and what customers see as a result. */
const HOTEL = 'Luxor West Bank Lodge';
const FROM = isoDays(60);
const TO = isoDays(62); // 2 nights
const minorOf = (text: string) => Math.round(Number(text.replace(/[^\d.]/g, '')) * 100);

async function setNet(page: Page, netEgp: number) {
  await signIn(page, ACCOUNTS.supplierAdmin);
  await page.goto('/en/supplier/rates');
  await chooseOption(page, page.getByTestId('rates-product'), { label: HOTEL });
  const bulk = page.getByTestId('bulk-edit');
  await pickDate(page, bulk.getByTestId('date-bulkFrom'), FROM);
  await pickDate(page, bulk.getByTestId('date-bulkTo'), TO);
  await bulk.locator('input[name=bulkNet]').fill(String(netEgp));
  const stored = nextPersist(page);
  await page.getByTestId('bulk-apply').click();
  await stored;
}

/** Customer price of Pharaoh's (network) Standard room for the test dates. */
async function customerStandardPrice(page: Page) {
  await signIn(page, ACCOUNTS.customer, 'customer');
  const sheet = await (await new SearchResults(page).open('hotel', { from: FROM, to: TO })).openOffer(HOTEL);
  const option = sheet.options().and(page.locator('[data-source=extranet]')).filter({ hasText: 'Standard room' }).first();
  await expect(option).toBeVisible();
  const price = (await option.innerText()).match(/EGP\s?[\d,]+\.\d{2}/)![0];
  return minorOf(price);
}

test('supplier net price change reaches the customer price through the whole chain', async ({ page }) => {
  test.slow();
  // +EGP 100 net per night × 2 nights → network platform default 5% → storefront hotels online 14% → VAT 14%.
  // The storefront rounds totals up to whole pounds, so allow one pound either way.
  const expectedDelta = Math.round(20_000 * 1.05 * 1.14 * 1.14);
  await setNet(page, 2000);
  const low = await customerStandardPrice(page);
  await setNet(page, 2100);
  const high = await customerStandardPrice(page);
  expect(Math.abs(high - low - expectedDelta), `delta ${high - low} vs expected ${expectedDelta}`).toBeLessThanOrEqual(100);
});

test('supplier edits its own product description; customers see it; another supplier cannot open it', async ({ page }) => {
  const text = `Riverside rooms with sunset views over the West Bank (${Date.now().toString(36)}).`;
  await signIn(page, ACCOUNTS.supplierAdmin);
  await page.goto('/en/supplier/products');
  await page.getByRole('searchbox').first().fill(HOTEL);
  const row = page.getByTestId('products-table').locator('tr, li').filter({ hasText: HOTEL }).first();
  await row.getByTestId('edit-product').click();
  const editor = page.getByTestId('product-editor');
  await editor.locator('textarea[name=descEn]').fill(text);
  const stored = nextPersist(page);
  await page.getByTestId('product-save').click();
  await stored;
  await page.reload();
  await page.getByRole('searchbox').first().fill(HOTEL);
  await page.getByTestId('products-table').locator('tr, li').filter({ hasText: HOTEL }).first().getByTestId('edit-product').click();
  await expect(page.getByTestId('product-editor').locator('textarea[name=descEn]')).toHaveValue(text);

  await signIn(page, ACCOUNTS.customer, 'customer');
  const sheet = await (await new SearchResults(page).open('hotel')).openOffer(HOTEL);
  await expect(sheet.root).toContainText(text);

  await signIn(page, 'supplier@skybridge.demo');
  await page.goto('/en/supplier/products');
  await page.getByRole('searchbox').first().fill(HOTEL);
  await expect(page.getByTestId('products-table').locator('tr, li').filter({ hasText: HOTEL })).toHaveCount(0);
});
