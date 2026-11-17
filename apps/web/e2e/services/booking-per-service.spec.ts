import { ACCOUNTS, expect, signIn, test } from '../fixtures';
import { Checkout } from '../pages/checkout';
import { SearchResults, SERVICES } from '../pages/storefront';

/**
 * Every service, as a storefront customer, end to end: search → details → option → add to cart → price/availability
 * re-check → service-specific traveller details → card payment → confirmation → My bookings → trip details →
 * self-service cancellation with a refund preview → cancelled status.
 */
for (const service of SERVICES) {
  test(`${service}: customer books, finds the trip and cancels it @xbrowser`, async ({ page }) => {
    test.slow();
    await signIn(page, ACCOUNTS.customer, 'customer');
    const results = await new SearchResults(page).open(service);
    await expect(results.results.first()).toBeVisible();
    await expect(results.results.first().locator(`[data-photo^="${service}-"]`)).toBeVisible();
    const sheet = await results.openOffer();
    await sheet.chooseOption();
    await expect(sheet.root.getByTestId('offer-policy')).toBeVisible();
    await sheet.addToCart();

    const checkout = await new Checkout(page).open();
    await checkout.fillTravellers();
    await checkout.payByCard();
    const ref = await checkout.confirmationRef();

    // My bookings → the new trip is upcoming; its details show the service and the payment.
    await page.goto('/en/account/bookings');
    const row = page.getByTestId('trip-row').filter({ hasText: ref });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByTestId('booking-finance')).toBeVisible();
    const item = page.getByTestId('booking-item').first();
    await expect(item).toHaveAttribute('data-service', service);

    // Self-service cancellation: the refund is previewed before anything happens, then the item is cancelled.
    const cancel = page.locator('[data-testid=booking-item] [data-action=cancel]').first();
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(page.getByTestId('cancel-quote')).toBeVisible();
    await expect(page.getByTestId('refund-amount')).toBeVisible();
    const reason = page.locator('textarea[name=cancelReason]');
    if (await reason.count()) await reason.fill('Plans changed');
    await page.getByTestId('cancel-submit').click();
    await expect(page.locator('[data-testid=booking-item][data-status=cancelled]')).toBeVisible();

    // The trip moves to the Cancelled tab.
    await page.goto('/en/account/bookings');
    await page.getByTestId('trip-tabs').locator('[data-tab="cancelled"]').click();
    await expect(page.getByTestId('trip-row').filter({ hasText: ref })).toBeVisible();
  });
}
