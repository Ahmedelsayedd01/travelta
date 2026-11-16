import { expect, expectNoHorizontalOverflow, signIn, test, ACCOUNTS } from './fixtures';

test('phone: compact profile menu and scrollable account navigation', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.getByTestId('profile-menu-trigger').tap();
  await page.getByTestId('menu-favorites').tap();
  await expect(page).toHaveURL(/\/en\/account\/favorites$/);
  const nav = page.getByTestId('account-nav');
  await expect(nav).toBeVisible();
  await nav.locator('[data-section="support"]').tap();
  await expect(page).toHaveURL(/\/en\/account\/support$/);
  await expectNoHorizontalOverflow(page);
});
