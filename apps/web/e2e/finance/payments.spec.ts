import type { Page } from '@playwright/test';
import { ACCOUNTS, expect, signIn, test } from '../fixtures';
import { CARDS } from '../factories/data';
import { Checkout } from '../pages/checkout';
import { SearchResults } from '../pages/storefront';

/**
 * Payment outcomes on the storefront (PAY-6/7) and the instalment rule (PAY: final due ≤ service start).
 * Outcomes are checked on what the customer can see afterwards (My bookings), not only on the toast.
 */
async function customerAtPayment(page: Page) {
  await signIn(page, ACCOUNTS.customer, 'customer');
  const sheet = await (await new SearchResults(page).open('hotel')).openOffer();
  await sheet.addToCart();
  const checkout = await new Checkout(page).open();
  await checkout.fillTravellers();
  await expect(page.getByTestId('card-form')).toBeVisible();
  return checkout;
}

async function myTripRefs(page: Page) {
  await page.goto('/en/account/bookings');
  await expect(page.getByTestId('trip-tabs')).toBeVisible();
  await expect(page.getByTestId('trip-row').first().or(page.getByText('No upcoming trips'))).toBeVisible();
  return page.getByTestId('trip-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-ref')));
}

test('declined card: a clear error, no booking is created @xbrowser', async ({ page }) => {
  const checkout = await customerAtPayment(page);
  await checkout.payByCard({ number: CARDS.declined });
  await expect(page.getByText('The card was declined. Try another card.').or(page.getByText('The payment was declined')).first()).toBeVisible();
  await expect(page.getByTestId('checkout-done')).toHaveCount(0);
  expect(await myTripRefs(page)).toEqual([]);
});

test('3-D Secure: the code is required, a wrong code is refused, the right code books', async ({ page }) => {
  const checkout = await customerAtPayment(page);
  await page.locator('input[name=cardNumber]').fill(CARDS.threeDs);
  await expect(page.locator('input[name=threeDs]')).toBeVisible();
  await page.locator('input[name=threeDs]').fill('000000');
  await checkout.payByCard({ number: CARDS.threeDs });
  await expect(page.getByText(/3-D Secure|verification/i).first()).toBeVisible();
  await expect(page.getByTestId('checkout-done')).toHaveCount(0);
  await page.locator('input[name=threeDs]').fill('123456');
  await page.getByTestId('submit-booking').click();
  const ref = await checkout.confirmationRef();
  expect(await myTripRefs(page)).toEqual([ref]);
});

test('double submit creates exactly one booking (idempotency key)', async ({ page }) => {
  await customerAtPayment(page);
  await page.locator('input[name=cardNumber]').fill(CARDS.ok);
  await page.locator('input[name=cardExpiry]').fill('12/29');
  await page.locator('input[name=cardCvc]').fill('123');
  await page.locator('input[name=cardHolder]').fill('Sara Ali');
  await page.getByTestId('submit-booking').dblclick();
  const ref = await new Checkout(page).confirmationRef();
  expect(await myTripRefs(page)).toEqual([ref]);
});

test('card payment is authorised at checkout (captured at supplier confirmation)', async ({ page }) => {
  const checkout = await customerAtPayment(page);
  await checkout.payByCard();
  const ref = await checkout.confirmationRef();
  await page.goto('/en/account/bookings');
  await expect(page.getByTestId('trip-row').filter({ hasText: ref })).toContainText('Card authorised');
});

test('pay later (enabled on the demo storefront, decision G3): booking is unpaid until paid', async ({ page }) => {
  const checkout = await customerAtPayment(page);
  await page.locator('[data-method=pay_later]').click();
  await expect(page.locator('input[name=cardNumber]')).toHaveCount(0);
  await page.getByTestId('submit-booking').click();
  const ref = await checkout.confirmationRef();
  await page.goto('/en/account/bookings');
  await expect(page.getByTestId('trip-row').filter({ hasText: ref })).toContainText('Unpaid');
});

test('instalments: the last due date can never be after the service starts', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  const sheet = await (await new SearchResults(page).open('hotel', { base: '/en/agency/search' })).openOffer();
  await sheet.addToCart();
  const checkout = await new Checkout(page, 'agency').open();
  await checkout.fillTravellers('Karim', 'Nabil');
  await page.locator('[data-plan=partial]').click();
  const last = page.getByTestId('date-inst1due');
  const serviceStart = (await last.getAttribute('data-value'))!; // the second instalment defaults to the service start
  expect(serviceStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await last.click();
  const popup = page.getByTestId('date-inst1due-popup');
  await expect(popup.locator(`button[data-day="${serviceStart}"]`)).toBeEnabled();
  const after = new Date(`${serviceStart}T00:00:00Z`); after.setUTCDate(after.getUTCDate() + 1);
  const dayAfter = popup.locator(`button[data-day="${after.toISOString().slice(0, 10)}"]`);
  if (await dayAfter.count()) await expect(dayAfter).toBeDisabled();
  await expect(popup.getByTestId('calendar-next')).toBeDisabled(); // no paging past the service month
});
