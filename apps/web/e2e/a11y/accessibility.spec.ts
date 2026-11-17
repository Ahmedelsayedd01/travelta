import { expect, expectAccessible, searchUrl, signIn, test, ACCOUNTS } from '../fixtures';

/** axe-core WCAG 2.1 AA on the key screens of every portal, light theme (dark + phone in accessibility.mobile.spec). */
const PUBLIC = ['/en', '/ar', searchUrl('/en/search', { destinationCode: 'LXR' }), '/en/login', '/en/account/login', '/en/account/register', '/en/forgot-password', '/en/s/nile-horizon'];
const AREAS: [string, 'staff' | 'customer', string[]][] = [
  [ACCOUNTS.platformAdmin, 'staff', ['/en/admin', '/en/admin/catalog', '/en/admin/locations', '/en/admin/organizations', '/en/admin/subscriptions', '/en/admin/audit-log']],
  [ACCOUNTS.agencyOwner, 'staff', ['/en/agency', '/en/agency/bookings', '/en/agency/wallet', '/en/agency/accounting', '/en/agency/crm', '/en/agency/reports']],
  [ACCOUNTS.supplierAdmin, 'staff', ['/en/supplier/reservations', '/en/supplier/products', '/en/supplier/statement']],
  [ACCOUNTS.customer, 'customer', ['/en/account', '/en/account/bookings', '/en/account/support']],
];

for (const path of PUBLIC) {
  test(`public page is accessible: ${path.split('?')[0]}`, async ({ page }) => {
    await page.goto(path);
    if (path.includes('/search?')) await expect(page.getByTestId('search-result').first()).toBeVisible({ timeout: 30_000 });
    await expectAccessible(page);
  });
}

for (const [email, audience, paths] of AREAS) {
  test(`signed-in screens are accessible for ${email}`, async ({ page }) => {
    await signIn(page, email, audience);
    for (const path of paths) {
      await page.goto(path);
      await expectAccessible(page);
    }
  });
}
