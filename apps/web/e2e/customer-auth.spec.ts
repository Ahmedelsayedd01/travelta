import { expect, signOut, test } from './fixtures';

const fillOtp = async (scope: import('@playwright/test').Locator, code: string) => scope.locator('input').first().fill(code);

/** Registration → email verification (OTP) → guided reset (email → code → password → done) → sign in again. */
test('customer registers, verifies the email, resets the password and signs in again', async ({ page }) => {
  const email = `e2e.${Date.now()}@example.com`;
  await page.goto('/en/account/register');
  await expect(page.getByTestId('auth-visual').locator('[data-photo]')).toBeVisible(); // desktop photo panel
  await page.locator('input[name=name]').fill('Laila Fathy');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('Travel#2026');
  await page.locator('input[name=confirmPassword]').fill('Travel#2025');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText("The passwords don't match")).toBeVisible();
  await expect(page.getByText('Please accept the booking terms to create your account')).toBeVisible();
  await page.locator('input[name=confirmPassword]').fill('Travel#2026');
  await page.getByTestId('accept-terms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account/);

  await page.getByTestId('verify-email-start').click();
  const code = (await page.getByTestId('demo-code').locator('strong').innerText()).trim();
  expect(code).toMatch(/^\d{6}$/);
  await fillOtp(page.getByTestId('verify-otp'), code);
  await page.getByTestId('verify-email-submit').click();
  await expect(page.getByText('Email verified')).toBeVisible();
  await expect(page.getByTestId('verify-email-banner')).toBeHidden();

  await signOut(page);
  await page.goto('/en/account/login');
  await page.getByTestId('forgot-link').click();
  await expect(page).toHaveURL(/forgot-password/);
  await expect(page.getByTestId('auth-steps')).toBeVisible();
  await page.getByTestId('forgot-form').locator('input[type=email]').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByTestId('resend-code')).toBeDisabled(); // cooldown
  await expect(page.getByTestId('resend-code')).toContainText(/Resend in \d+s/);
  // A wrong code comes back to the code step with the server's message.
  await fillOtp(page.getByTestId('otp-input'), '000001');
  await page.getByTestId('code-continue').click();
  await page.locator('input[name=password]').fill('NewTravel#2027');
  await page.locator('input[name=confirmPassword]').fill('NewTravel#2027');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByText('The code is invalid or has expired')).toBeVisible();
  const resetCode = (await page.getByTestId('demo-code').locator('strong').innerText()).trim();
  await fillOtp(page.getByTestId('otp-input'), resetCode);
  await page.getByTestId('code-continue').click();
  await page.locator('input[name=password]').fill('NewTravel#2027');
  await page.locator('input[name=confirmPassword]').fill('NewTravel#2027');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByTestId('reset-success')).toBeVisible();
  await page.getByTestId('back-to-login').click();
  await expect(page).toHaveURL(/\/account\/login/);

  await page.locator('input[type=email]').fill(email);
  await page.locator('input[name=password]').fill('NewTravel#2027');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await expect(page).toHaveURL(/\/account(?!\/login)/);
});

test('password reset does not reveal unknown accounts', async ({ page }) => {
  await page.goto('/en/forgot-password');
  await page.getByTestId('forgot-form').locator('input[type=email]').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText(/If an account exists for nobody@example.com/)).toBeVisible();
  await expect(page.getByTestId('demo-code')).toHaveCount(0);
});

test('show/hide password and "keep me signed in" (tab-only session when unchecked)', async ({ page }) => {
  await page.goto('/en/account/login');
  const pw = page.locator('input[name=password]');
  await pw.fill('Demo@1234');
  await expect(pw).toHaveAttribute('type', 'password');
  await page.getByTestId('toggle-password').click();
  await expect(pw).toHaveAttribute('type', 'text');
  await page.getByTestId('toggle-password').click();
  await expect(pw).toHaveAttribute('type', 'password');
  await page.locator('input[type=email]').fill('customer@example.com');
  await page.getByRole('checkbox', { name: 'Keep me signed in' }).click();
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await expect(page).toHaveURL(/\/account(?!\/login)/);
  const where = await page.evaluate(() => ({ local: localStorage.getItem('travelta:session'), tab: sessionStorage.getItem('travelta:session') }));
  expect(where.local).toBeNull();
  expect(where.tab).toContain('customer@example.com');
});
