import { expect, signIn, test, ACCOUNTS } from './fixtures';

/** Scenario G — global access for the platform, tenant isolation for everyone else (enforced server-side). */
test('platform admin sees every management area', async ({ page }) => {
  await signIn(page, ACCOUNTS.platformAdmin);
  await page.goto('/en/admin');
  const nav = page.getByRole('navigation').first();
  for (const label of ['Organizations', 'Catalog', 'Locations', 'Bookings', 'Pricing', 'Accounting', 'Subscriptions', 'Audit log']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
});

test('an agency cannot open the platform portal or another agency\'s booking', async ({ page }) => {
  // Take one of Nile Horizon's own booking ids…
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/bookings');
  await page.getByTestId('bookings-table').locator('tbody tr').first().click();
  await expect(page).toHaveURL(/\/agency\/bookings\/[^/]+$/);
  const bookingId = page.url().split('/').pop()!;

  // …then try to open it as Red Sea Journeys by editing the URL.
  await signIn(page, ACCOUNTS.otherAgencyOwner);
  await page.goto(`/en/agency/bookings/${bookingId}`);
  await expect(page.getByText('Not found')).toBeVisible();
  await expect(page.getByText("This record doesn't exist or you don't have access to it.")).toBeVisible();
  await page.goto('/en/admin/organizations');
  await expect(page).not.toHaveURL(/\/admin\/organizations$/);
});

test('a supplier only sees its own products and has no agency or admin areas', async ({ page }) => {
  await signIn(page, ACCOUNTS.supplierAdmin);
  await page.goto('/en/supplier/products');
  const table = page.getByTestId('products-table');
  await expect(table).toBeVisible();
  await expect(table.getByText('Golden Pyramids Hotel')).toHaveCount(0); // Nile Horizon's own hotel
  await page.goto('/en/agency/wallet');
  await expect(page).not.toHaveURL(/\/agency\/wallet$/);
});

test('a customer only reaches their own account', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto('/en/account/bookings');
  await expect(page.getByTestId('bookings-table')).toBeVisible();
  await page.goto('/en/agency');
  await expect(page).not.toHaveURL(/\/agency$/);
  await page.goto('/en/admin');
  await expect(page).not.toHaveURL(/\/admin$/);
});
