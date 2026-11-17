import type { Page } from '@playwright/test';
import { chooseOption, expect, searchUrl, signIn, test, ACCOUNTS } from '../fixtures';

/** Staff see source badges and pick the network (extranet) offer; customers just take the first result. */
async function addHotelToCart(page: Page, path: string, network: boolean) {
  await page.goto(searchUrl(path, { destinationCode: 'LXR' }));
  const results = page.getByTestId('search-result');
  await expect(results.first()).toBeVisible({ timeout: 30_000 });
  const card = network ? results.filter({ hasText: 'B2B network' }).first() : results.first();
  await card.getByTestId('open-offer').click();
  if (network) await page.getByTestId('offer-option').filter({ hasText: 'B2B network' }).first().click();
  const add = page.getByTestId('add-to-cart');
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
}

/** Scenarios D, E, F, H — agency sale → supplier confirmation → invoice & voucher → cancellation & refund → balanced books. */
test('agency booking through supplier confirmation, voucher, cancellation, refund and accounting', async ({ page }) => {
  test.slow();
  await signIn(page, ACCOUNTS.agencyOwner);
  await addHotelToCart(page, '/en/agency/search', true);
  await page.goto('/en/agency/checkout');
  await expect(page.getByText('All prices and availability confirmed')).toBeVisible();
  await page.getByTestId('checkout-next').click();
  await page.getByTestId('customer-option').first().click();
  await page.getByTestId('checkout-next').click();
  await expect(page.getByTestId('traveller-fields').first()).toBeVisible();
  for (const input of await page.locator('input[name$=first]').all()) await input.fill('Karim');
  for (const input of await page.locator('input[name$=last]').all()) await input.fill('Nabil');
  await page.getByTestId('checkout-next').click();
  await page.getByTestId('submit-booking').click();
  const done = page.getByTestId('checkout-done');
  await expect(done).toBeVisible();
  const ref = (await done.innerText()).match(/TRV-\d{4}-\d{5}/)![0];
  await page.getByTestId('view-booking').click();
  await expect(page.getByTestId('booking-finance')).toContainText('Wallet holds');
  const bookingUrl = new URL(page.url()).pathname;

  // Supplier confirms the reservation on its board.
  await signIn(page, ACCOUNTS.supplierAdmin);
  await page.goto('/en/supplier/reservations');
  const pending = page.locator(`[data-column=colPending] [data-testid=board-card][data-ref="${ref}"]`);
  await pending.locator('[data-action=confirm]').click();
  await page.locator('input[name=supplierRef]').fill('PS-E2E-001');
  await page.getByTestId('confirm-submit').click();
  await expect(page.locator(`[data-column=colConfirmed] [data-testid=board-card][data-ref="${ref}"]`)).toBeVisible();
  await page.goto('/en/supplier/statement');
  await page.getByTestId('payables-table').locator('input[type=search]').fill(ref);
  await expect(page.getByTestId('payables-table')).toContainText(ref);

  // Agency: invoice issued at confirmation, voucher issued on demand.
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto(bookingUrl);
  await expect(page.getByTestId('invoice-link')).toBeVisible();
  await expect(page.getByTestId('booking-finance')).toContainText(/INV-\d{4}-\d{6}/);
  // Vouchers need the booking paid (or an agreed plan): collect the balance first.
  await page.getByTestId('collect-payment').click();
  const collect = page.getByTestId('collect-dialog');
  await chooseOption(page, collect.getByTestId('select-account0'), { index: 1 });
  await page.getByTestId('collect-submit').click();
  await expect(collect).toBeHidden();
  await page.locator('[data-action=voucher]').first().click();
  await expect(page.getByTestId('voucher-link')).toBeVisible();

  // Cancellation with the supplier policy: fee and refund previewed, then applied.
  await page.locator('[data-testid=booking-item] [data-action=cancel]').first().click();
  await expect(page.getByTestId('cancel-quote')).toBeVisible();
  await expect(page.getByTestId('refund-amount')).toBeVisible();
  await page.locator('textarea[name=cancelReason]').fill('Customer changed travel dates');
  await page.getByTestId('cancel-submit').click();
  await expect(page.locator('[data-testid=booking-item][data-status=cancelled]')).toBeVisible();

  // Books stay balanced after the whole cycle.
  await page.goto('/en/agency/accounting');
  await expect(page.getByTestId('tb-status')).toHaveText('Balanced');
});

/** Scenario C — a customer books on Travelta Direct, sees the trip in My bookings and cancels it with a refund. */
test('customer storefront booking, trip details and self-service cancellation', async ({ page }) => {
  test.slow();
  await page.goto(searchUrl('/en/search', { destinationCode: 'LXR' }));
  await page.getByTestId('search-result').first().getByTestId('open-offer').click();
  // Browsing is public; booking asks for an account and keeps the search in `next`.
  const signInToBook = page.getByTestId('sign-in-to-book');
  await expect(signInToBook).toHaveAttribute('href', /next=/);
  await signIn(page, ACCOUNTS.customer, 'customer');
  await addHotelToCart(page, '/en/search', false);
  await page.goto('/en/account/cart');
  await page.getByTestId('go-checkout').click();
  await expect(page.getByText('All prices and availability confirmed')).toBeVisible();
  await page.getByTestId('checkout-next').click();
  for (const input of await page.locator('input[name$=first]').all()) await input.fill('Sara');
  for (const input of await page.locator('input[name$=last]').all()) await input.fill('Ali');
  await page.getByTestId('checkout-next').click();
  await page.locator('input[name=cardNumber]').fill('4242 4242 4242 4242');
  await page.locator('input[name=cardExpiry]').fill('12/29');
  await page.locator('input[name=cardCvc]').fill('123');
  await page.locator('input[name=cardHolder]').fill('Sara Ali');
  await page.getByTestId('submit-booking').click();
  const done = page.getByTestId('checkout-done');
  await expect(done).toBeVisible();
  const ref = (await done.innerText()).match(/TRV-\d{4}-\d{5}/)![0];

  await page.goto('/en/account/bookings');
  await expect(page.getByTestId('bookings-table')).toContainText(ref);
  await page.getByTestId('bookings-table').locator('tbody tr, li').filter({ hasText: ref }).first().click();
  await expect(page.getByTestId('booking-finance')).toBeVisible();
  await page.locator('[data-action=cancel]').first().click();
  await expect(page.getByTestId('refund-amount')).toBeVisible();
  const reason = page.locator('textarea[name=cancelReason]');
  if (await reason.count()) await reason.fill('Plans changed');
  await page.getByTestId('cancel-submit').click();
  await expect(page.locator('[data-testid=booking-item][data-status=cancelled]')).toBeVisible();
});
