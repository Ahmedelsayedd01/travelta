import { ACCOUNTS, expect, expectAccessible, signIn, test } from '../fixtures';
import { Checkout } from '../pages/checkout';
import { SearchResults } from '../pages/storefront';

/**
 * Keyboard and focus behaviour, and axe scans of screens the page-level scan does not reach: open menus and dialogs,
 * the checkout steps, and the state-dependent screens fixed in this round.
 */

test('profile menu by keyboard: opens, moves, closes with Escape and returns focus', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  const trigger = page.getByTestId('profile-menu-trigger');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByTestId('profile-menu');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem').filter({ has: page.locator(':focus') }).or(menu.locator('[role=menuitem]:focus'))).toHaveCount(1);
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('dialogs trap focus and give it back: promo code dialog', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/pricing');
  await page.getByRole('tab', { name: 'Promo codes' }).click();
  const open = page.getByRole('button', { name: 'New promo code' });
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Opening moves focus into the dialog (after its entrance animation starts).
  await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    // Base UI wraps focus with guard elements at the dialog's edges; settle a frame before checking.
    await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement)), { message: 'focus stays inside the dialog', timeout: 2_000 }).toBe(true);
  }
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});

test('checkout steps pass axe (travellers with passports, payment)', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  const sheet = await (await new SearchResults(page).open('flight')).openOffer();
  await expectAccessible(page);
  await sheet.addToCart();
  await new Checkout(page).open();
  await expectAccessible(page);
  await new Checkout(page).fillTravellers();
  await expect(page.getByTestId('card-form')).toBeVisible();
  await expectAccessible(page);
});

test('sub-agency compliance page explains itself and passes axe', async ({ page }) => {
  await signIn(page, ACCOUNTS.subAgencyOwner);
  await page.goto('/en/agency/kyc');
  await expect(page.getByText('Verified through your parent agency')).toBeVisible();
  await expectAccessible(page);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`toasts meet contrast in ${scheme} mode (regression: Sonner's green was 4.25:1)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, ACCOUNTS.customer, 'customer'); // shows the "Welcome back" success toast
    const toast = page.locator('[data-sonner-toast][data-type=success]').first();
    await expect(toast).toBeVisible();
    await expectAccessible(page);
  });
}
