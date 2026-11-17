import { expect, pickOption, searchUrl, signIn, signOut, test, ACCOUNTS } from './fixtures';

const SECTIONS = ['profile', 'bookings', 'travelers', 'favorites', 'notifications', 'support', 'settings'] as const;

test('logged out: the profile menu offers sign in and create account; protected pages return after login', async ({ page }) => {
  await page.goto('/en');
  await page.getByTestId('profile-menu-trigger').click();
  const menu = page.getByTestId('profile-menu');
  await expect(menu.getByRole('menuitem', { name: 'Sign in' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Create account' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/account\/register$/);
  // Deep link to a protected page → login → back to that page.
  await page.goto('/en/account/travelers');
  await expect(page).toHaveURL(/\/en\/account\/login\?next=/);
  await page.locator('input[type=email]').fill(ACCOUNTS.customer);
  await page.locator('input[name=password]').fill('Demo@1234');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await expect(page).toHaveURL(/\/en\/account\/travelers$/);
});

test('logged in: the profile dropdown shows the customer and every account section; no dashboard', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await expect(page).toHaveURL(/\/en\/?$/); // storefront is the customer's home
  await page.getByTestId('profile-menu-trigger').click();
  const menu = page.getByTestId('profile-menu');
  await expect(menu.getByTestId('menu-name')).toHaveText('Sara Ali');
  await expect(menu.getByTestId('menu-email')).toHaveText(ACCOUNTS.customer);
  for (const s of SECTIONS) await expect(menu.getByTestId(`menu-${s}`)).toBeVisible();
  await page.keyboard.press('Escape');
  for (const s of SECTIONS) {
    await page.getByTestId('profile-menu-trigger').click();
    await page.getByTestId(`menu-${s}`).click();
    await expect(page).toHaveURL(new RegExp(`/en/account/${s}$`));
    await expect(page.getByTestId('account-shell')).toBeVisible();
    await expect(page.getByTestId('account-nav').locator(`[data-section="${s}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  // The old dashboard is gone: /account opens the trips, the business sidebar never appears.
  await page.goto('/en/account');
  await expect(page).toHaveURL(/\/en\/account\/bookings$/);
  await expect(page.getByTestId('sidebar')).toHaveCount(0);
  await expect(page.getByText('Overview')).toHaveCount(0);
});

test('bookings: upcoming / past / cancelled tabs and booking details', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto('/en/account/bookings');
  const tabs = page.getByTestId('trip-tabs');
  for (const tab of ['past', 'cancelled', 'upcoming']) {
    await tabs.locator(`[data-tab="${tab}"]`).click();
    await expect(tabs.locator(`[data-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('trip-row').first().or(page.getByText(/No (upcoming|past) trips|No cancelled bookings/))).toBeVisible();
  }
  // The demo customer starts with no trips: each tab shows its own empty state with a way to book.
  await expect(page.getByText('No upcoming trips')).toBeVisible();
  // Opening a trip's details (vouchers, payments, cancellation) is covered after a real checkout in booking-lifecycle.spec.ts.
});

test('profile: validation, save, read back; password change with wrong and right current password', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto('/en/account/profile');
  const form = page.getByTestId('profile-form');
  await form.locator('input[name=name]').fill('S');
  await form.locator('input[name=phone]').fill('abc');
  await page.getByTestId('profile-save').click();
  await expect(form.getByText('Enter a valid phone number')).toBeVisible();
  await expect(form.getByRole('alert').first()).toBeVisible();
  await form.locator('input[name=name]').fill('Sara A. Ali');
  await form.locator('input[name=phone]').fill('+20 100 555 1234');
  await pickOption(page, 'nationality', 'JO');
  await page.getByTestId('profile-save').click();
  await expect(page.getByText('Profile saved')).toBeVisible();
  await page.reload();
  await expect(form.locator('input[name=name]')).toHaveValue('Sara A. Ali');
  await expect(page.getByTestId('select-nationality')).toHaveAttribute('data-value', 'JO');
  await page.getByTestId('profile-menu-trigger').click();
  await expect(page.getByTestId('menu-name')).toHaveText('Sara A. Ali');
  await page.keyboard.press('Escape');

  const pw = page.getByTestId('password-form');
  await pw.locator('input[name=currentPassword]').fill('Wrong#Pass1');
  await pw.locator('input[name=newPassword]').fill('Fresh#Trip2027');
  await pw.locator('input[name=confirm]').fill('Fresh#Trip2027');
  await page.getByTestId('password-save').click();
  await expect(pw.getByText('The current password is incorrect')).toBeVisible();
  await pw.locator('input[name=currentPassword]').fill('Demo@1234');
  await page.getByTestId('password-save').click();
  await expect(page.getByText('Password updated')).toBeVisible();
  await signOut(page);
  await signIn(page, ACCOUNTS.customer, 'customer', 'Fresh#Trip2027');
});

test('travelers: add with validation, edit, use at checkout, remove', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto('/en/account/travelers');
  await expect(page.getByText('No saved travellers')).toBeVisible();
  await page.getByTestId('add-traveler').click();
  const form = page.getByTestId('traveler-form');
  await pickOption(page, 'type', 'child');
  await form.locator('input[name=firstName]').fill('Omar');
  await form.locator('input[name=lastName]').fill('Ali');
  await page.getByTestId('traveler-save').click();
  await expect(form.getByText('This field is required')).toBeVisible(); // child needs a date of birth
  await pickOption(page, 'type', 'adult');
  await page.getByTestId('traveler-save').click();
  const list = page.getByTestId('travelers-list');
  await expect(list).toContainText('Mr Omar Ali');
  await list.getByRole('button', { name: 'Edit Omar' }).click();
  await page.getByTestId('traveler-form').locator('input[name=firstName]').fill('Omer');
  await page.getByTestId('traveler-save').click();
  await expect(list).toContainText('Mr Omer Ali');

  // Checkout: fill the lead traveller from the saved list.
  await page.goto(searchUrl('/en/search', { destinationCode: 'LXR' }));
  await page.getByTestId('search-result').first().getByTestId('open-offer').click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
  await page.goto('/en/account/checkout');
  await expect(page.getByText('All prices and availability confirmed')).toBeVisible(); // as in booking-lifecycle.spec
  await page.getByTestId('checkout-next').click();
  await page.locator('[data-testid="select-t0saved"]').click();
  await page.getByRole('option', { name: 'Omer Ali' }).click();
  await expect(page.locator('input[name=t0first]')).toHaveValue('Omer');
  await expect(page.locator('input[name=t0last]')).toHaveValue('Ali');

  await page.goto('/en/account/travelers');
  await page.getByTestId('travelers-list').getByRole('button', { name: 'Remove Omer' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('No saved travellers')).toBeVisible();
});

test('support: a request appears in "My support requests" as open', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto('/en/account/support');
  await page.locator('textarea[name=message]').fill('Can I add an extra night to my Luxor booking?');
  await page.getByTestId('support-send').click();
  const ticket = (await page.getByTestId('support-ticket').innerText()).match(/SUP-\d{5}/)![0];
  await expect(page.getByTestId('my-tickets').getByTestId('ticket-row').filter({ hasText: ticket })).toContainText('Open');
});

test('settings: language and theme work; unsupported preferences are labelled, not faked', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  await page.goto('/en/account/settings');
  await expect(page.getByTestId('not-available')).toHaveCount(3);
  const shell = page.getByTestId('account-shell');
  await shell.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shell.getByRole('link', { name: 'العربية' }).click();
  await expect(page).toHaveURL(/\/ar\/account\/settings$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('account-nav')).toContainText('حجوزاتي');
});

test('role protection: customers stay out of business portals; staff stay out of the customer account', async ({ page }) => {
  await signIn(page, ACCOUNTS.customer, 'customer');
  for (const path of ['/en/admin', '/en/agency/bookings', '/en/supplier/reservations']) {
    await page.goto(path);
    // The existing staff guard sends a customer session to the business sign-in; the portal itself never renders.
    await expect(page).toHaveURL(/\/en\/login\?next=/);
    await expect(page.getByTestId('sidebar')).toHaveCount(0);
  }
  await signOut(page);
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/account/bookings');
  // Same existing guard rule in reverse: a staff session is sent to the customer sign-in, never into the account.
  await expect(page).toHaveURL(/\/en\/account\/login\?next=%2Faccount%2Fbookings/);
  await expect(page.getByTestId('account-shell')).toHaveCount(0);
  await page.goto('/en/agency');
  await expect(page.getByTestId('sidebar')).toBeVisible(); // business dashboards unchanged
});
