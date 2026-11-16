import { expect, signOut, test } from './fixtures';

/** Registration → email verification (OTP) → forgot password → reset → sign in with the new password. */
test('customer registers, verifies the email, resets the password and signs in again', async ({ page }) => {
  const email = `e2e.${Date.now()}@example.com`;
  await page.goto('/en/account/register');
  await page.locator('input[name=name]').fill('Laila Fathy');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('Travel#2026');
  await page.getByRole('button', { name: /create account|register|sign up/i }).click();
  await expect(page).toHaveURL(/\/account/);

  const banner = page.getByTestId('verify-email-banner');
  await expect(banner).toBeVisible();
  await page.getByTestId('verify-email-start').click();
  const code = (await page.getByTestId('demo-code').locator('strong').innerText()).trim();
  expect(code).toMatch(/^\d{6}$/);
  await page.getByRole('dialog').locator('input[name=code]').fill(code);
  await page.getByTestId('verify-email-submit').click();
  await expect(page.getByText('Email verified')).toBeVisible();
  await expect(banner).toBeHidden();

  await signOut(page);
  await page.goto('/en/account/login');
  await page.getByTestId('forgot-link').click();
  await expect(page).toHaveURL(/forgot-password/);
  await page.getByTestId('forgot-form').locator('input[type=email]').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  const reset = page.getByTestId('reset-form');
  // A wrong code is rejected on the field…
  await reset.locator('input[name=code]').fill('000001');
  await reset.locator('input[name=password]').fill('NewTravel#2027');
  await reset.getByRole('button', { name: 'Reset password' }).click();
  await expect(reset.getByText('The code is invalid or has expired')).toBeVisible();
  // …the right one works.
  const resetCode = (await page.getByTestId('demo-code').locator('strong').innerText()).trim();
  await reset.locator('input[name=code]').fill(resetCode);
  await reset.getByRole('button', { name: 'Reset password' }).click();
  await expect(page).toHaveURL(/\/account\/login/);

  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('NewTravel#2027');
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
