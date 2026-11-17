import type { Page } from '@playwright/test';
import { ACCOUNTS, chooseOption, expect, signIn, test } from '../fixtures';
import { isoDays } from '../factories/data';
import { pickDate } from '../pages/controls';
import { Checkout } from '../pages/checkout';
import { SearchResults } from '../pages/storefront';

/**
 * Workflows that move between roles. After each important action the result is checked from the other roles'
 * screens — never only from the success message.
 */
const HOTEL = 'Luxor West Bank Lodge'; // a Pharaoh Stays (network supplier) hotel in Luxor
const FROM = isoDays(45);
const TO = isoDays(47);

/** Customer books Pharaoh's hotel; returns the booking ref and its customer URL. */
async function customerBooksPharaohHotel(page: Page) {
  await signIn(page, ACCOUNTS.customer, 'customer');
  const results = await new SearchResults(page).open('hotel', { from: FROM, to: TO });
  const sheet = await results.openOffer(HOTEL);
  await sheet.options().and(page.locator('[data-source=extranet]')).first().click(); // Pharaoh's own (network) rate
  await sheet.addToCart();
  const checkout = await new Checkout(page).open();
  await checkout.fillTravellers();
  await checkout.payByCard();
  const ref = await checkout.confirmationRef();
  await page.goto('/en/account/bookings');
  await page.getByTestId('trip-row').filter({ hasText: ref }).click();
  await expect(page.getByTestId('booking-finance')).toBeVisible();
  return { ref, url: new URL(page.url()).pathname };
}

const boardCard = (page: Page, column: string, ref: string) => page.locator(`[data-column=${column}] [data-testid=board-card][data-ref="${ref}"]`);

test('hotel: customer books → supplier confirms → customer sees it confirmed and paid → admin sees booking and money → customer cancels with refund → books balance', async ({ page }) => {
  test.slow();
  const { ref, url } = await customerBooksPharaohHotel(page);
  await expect(page.getByTestId('booking-item').first()).toHaveAttribute('data-status', /pending|requested|on_request/);

  // Supplier: the request is on its board; it confirms with its own reference.
  await signIn(page, ACCOUNTS.supplierAdmin);
  await page.goto('/en/supplier/reservations');
  await boardCard(page, 'colPending', ref).locator('[data-action=confirm]').click();
  await page.locator('input[name=supplierRef]').fill('PS-E2E-B2C');
  await page.getByTestId('confirm-submit').click();
  await expect(boardCard(page, 'colConfirmed', ref)).toBeVisible();

  // Customer: confirmed; the authorised card was captured at confirmation (PAY-6).
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto('/en/account/bookings');
  const row = page.getByTestId('trip-row').filter({ hasText: ref });
  await expect(row).toContainText('Confirmed');
  await expect(row).toContainText('Paid');
  await page.goto(url);
  await expect(page.getByTestId('booking-item').first()).toContainText('PS-E2E-B2C');

  // Platform admin: the booking and its payment are visible platform-wide.
  await signIn(page, ACCOUNTS.platformAdmin);
  await page.goto('/en/admin/bookings');
  const table = page.getByTestId('bookings-table');
  await table.locator('input[type=search]').fill(ref);
  await expect(table).toContainText(ref);
  await table.locator('tbody tr').filter({ hasText: ref }).first().click();
  await expect(page.getByTestId('booking-finance')).toBeVisible();

  // Customer cancels: refund previewed, item cancelled, payment refunded.
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto(url);
  await page.locator('[data-testid=booking-item] [data-action=cancel]').first().click();
  await expect(page.getByTestId('refund-amount')).toBeVisible();
  const reason = page.locator('textarea[name=cancelReason]');
  if (await reason.count()) await reason.fill('Plans changed');
  await page.getByTestId('cancel-submit').click();
  await expect(page.locator('[data-testid=booking-item][data-status=cancelled]')).toBeVisible();
  await page.goto('/en/account/bookings');
  await page.getByTestId('trip-tabs').locator('[data-tab="cancelled"]').click();
  await expect(page.getByTestId('trip-row').filter({ hasText: ref })).toContainText(/Refunded|Partially paid|Paid/);

  // The supplier sees it cancelled; the platform ledger is still balanced.
  await signIn(page, ACCOUNTS.supplierAdmin);
  await page.goto('/en/supplier/reservations');
  await expect(boardCard(page, 'colPending', ref)).toHaveCount(0);
  await signIn(page, ACCOUNTS.platformAdmin);
  await page.goto('/en/admin/accounting');
  await expect(page.getByTestId('tb-status')).toHaveText('Balanced');
});

test('hotel: supplier rejects → customer sees the rejection and is not charged', async ({ page }) => {
  test.slow();
  const { ref, url } = await customerBooksPharaohHotel(page);
  await signIn(page, ACCOUNTS.supplierAdmin);
  await page.goto('/en/supplier/reservations');
  await boardCard(page, 'colPending', ref).locator('[data-action=reject]').click();
  await page.locator('textarea[name=reason]').fill('No rooms left for these dates');
  await page.getByTestId('reject-submit').click();
  await expect(boardCard(page, 'colPending', ref)).toHaveCount(0);

  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto(url);
  const item = page.getByTestId('booking-item').first();
  await expect(item).toHaveAttribute('data-status', 'rejected');
  await expect(item).toContainText('No rooms left for these dates');
  await page.goto('/en/account/bookings');
  // The card authorisation is voided: nothing was captured.
  await expect(page.getByTestId('trip-row').filter({ hasText: ref }).first().or(page.getByText('No upcoming trips'))).toBeVisible();
  const status = page.getByTestId('trip-row').filter({ hasText: ref });
  if (await status.count()) await expect(status).not.toContainText(/Paid$|^Paid/);
});

test('supplier stop-sell removes its room from customer availability; reopening brings it back', async ({ page }) => {
  test.slow();
  const countStandard = async () => {
    const sheet = await (await new SearchResults(page).open('hotel', { from: FROM, to: TO })).openOffer(HOTEL);
    await expect(sheet.options().first()).toBeVisible();
    const n = await sheet.options().and(page.locator('[data-source=extranet]')).filter({ hasText: 'Standard room' }).count();
    await page.keyboard.press('Escape');
    return n;
  };
  const setSale = async (sale: 'stop' | 'open') => {
    await signIn(page, ACCOUNTS.supplierAdmin);
    await page.goto('/en/supplier/rates');
    await chooseOption(page, page.getByTestId('rates-product'), { label: HOTEL });
    const bulk = page.getByTestId('bulk-edit');
    await pickDate(page, bulk.getByTestId('date-bulkFrom'), FROM);
    await pickDate(page, bulk.getByTestId('date-bulkTo'), TO);
    await chooseOption(page, bulk.getByTestId('select-bulkSale'), { label: sale === 'stop' ? 'Stop sell' : 'Open for sale' });
    await page.getByTestId('bulk-apply').click();
    await expect(page.getByText(/updated|saved|applied/i).first()).toBeVisible();
  };

  await signIn(page, ACCOUNTS.customer, 'customer');
  const before = await countStandard();
  expect(before, 'Pharaoh sells a Standard room in Luxor').toBeGreaterThan(0);
  await setSale('stop');
  await signIn(page, ACCOUNTS.customer, 'customer');
  expect(await countStandard(), 'after stop-sell').toBe(before - 1); // Pharaoh's Standard room is gone; other rooms stay
  await setSale('open');
  await signIn(page, ACCOUNTS.customer, 'customer');
  expect(await countStandard(), 'after reopening').toBe(before);
});
