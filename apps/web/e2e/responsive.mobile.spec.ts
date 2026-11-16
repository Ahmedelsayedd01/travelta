import { expect, expectAccessible, expectNoHorizontalOverflow, searchUrl, signIn, test, ACCOUNTS } from './fixtures';

/** Phone width + dark theme: no sideways scrolling and no WCAG AA violations on the main screens. */
const SCREENS: [string | null, 'staff' | 'customer', string[]][] = [
  [null, 'customer', ['/en', '/ar', searchUrl('/en/search', { destinationCode: 'LXR' }), '/en/account/login']],
  [ACCOUNTS.customer, 'customer', ['/en/account', '/en/account/bookings']],
  [ACCOUNTS.agencyOwner, 'staff', ['/en/agency', '/en/agency/bookings', '/en/agency/wallet']],
  [ACCOUNTS.platformAdmin, 'staff', ['/en/admin/catalog', '/en/admin/locations']],
];

for (const [email, audience, paths] of SCREENS) {
  test(`phone layout (dark) ${email ?? 'public'}`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('travelta:theme', 'dark'); } catch { /* ignore */ } });
    if (email) await signIn(page, email, audience);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expectAccessible(page);
      await expectNoHorizontalOverflow(page);
    }
  });
}
