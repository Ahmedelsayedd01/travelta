import { expect, searchUrl, signIn, test, ACCOUNTS } from '../fixtures';

test('customer saves a hotel to favorites from search and finds it in the account', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto(searchUrl('/en/search', { destinationCode: 'LXR' }));
  const card = page.getByTestId('search-result').first();
  const name = (await card.locator('h3').innerText()).trim();
  const heart = card.getByTestId('favorite-toggle');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/en/account/favorites');
  await expect(page.getByTestId('favorites-list')).toContainText(name);
  await page.getByRole('button', { name: `Remove ${name} from favorites` }).click();
  await expect(page.getByText('No favorites yet')).toBeVisible();
});

test('dashboard explains the profit KPI line by line from the ledger', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency');
  const kpi = page.locator('[data-testid=kpi][data-kpi=profit]');
  await expect(kpi).toBeVisible();
  const card = page.getByTestId('profit-breakdown');
  await expect(card).toBeVisible();
  for (const label of ['Revenue', 'Cost of sales (supplier cost)', 'Gross profit', 'Operating expenses', 'Net profit', 'Cash movement in the period']) {
    await expect(card.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(card.getByText('Rent', { exact: true })).toBeVisible();
  await expect(card.getByText('Salaries', { exact: true })).toBeVisible();
});

test('custom domain configuration says DNS and SSL are simulated and shows the tenant mapping', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/storefront');
  await expect(page.getByTestId('dns-demo-notice')).toContainText('DNS and SSL are not connected');
  await page.locator('input[name=domain]').fill('book.nilehorizon.com');
  await page.getByTestId('domain-save').click();
  await expect(page.getByTestId('dns-steps')).toBeVisible();
  await page.getByTestId('simulate-dns').click();
  await expect(page.getByText('Record found')).toBeVisible();
  await page.getByTestId('verify-domain').click();
  await expect(page.getByTestId('domain-status')).toHaveText('Verified');
  await expect(page.getByTestId('domain-mapping')).toContainText('book.nilehorizon.com');
  await expect(page.getByTestId('domain-mapping')).toContainText('Nile Horizon');
});
