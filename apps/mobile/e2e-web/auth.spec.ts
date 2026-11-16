import { byId, DEMO_PASSWORD, expect, signIn, test } from './fixtures';

test('sign in, session survives a reload, sign out', async ({ page }) => {
  await signIn(page);
  await page.reload();
  await page.goto('/profile');
  await expect(page.getByText('customer@example.com', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
});

test('wrong password shows a clear error; show/hide password works', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('customer@example.com');
  const pw = byId(page, 'm-login-password');
  await pw.fill('Wrong#Pass1');
  await expect(pw).toHaveAttribute('type', 'password');
  await byId(page, 'toggle-password').first().click();
  await expect(pw).not.toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Email or password is incorrect')).toBeVisible();
});

test('register with confirm password and terms, then verify the email with the code', async ({ page }) => {
  await page.goto('/register');
  await expect(byId(page, 'auth-photo')).toBeVisible();
  await page.getByLabel('Full name').fill('Omar Hany');
  await page.getByLabel('Email').fill(`m.${Date.now()}@example.com`);
  await byId(page, 'm-register-password').fill('Travel#2026');
  await byId(page, 'm-register-confirm').fill('Travel#2025');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText("The passwords don't match")).toBeVisible();
  await expect(page.getByText('Please accept the booking terms to create your account')).toBeVisible();
  await byId(page, 'm-register-confirm').fill('Travel#2026');
  await byId(page, 'm-accept-terms').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/profile');
  await byId(page, 'm-verify-start').click();
  const code = (await byId(page, 'm-demo-code').innerText()).match(/\d{6}/)![0];
  await byId(page, 'm-verify-code').fill(code);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(byId(page, 'web-toast')).toContainText('Email verified');
  await expect(byId(page, 'm-verify-card')).toHaveCount(0);
});

test('forgot password: email → code (wrong then right) → new password → success → sign in', async ({ page }) => {
  await page.goto('/login');
  await byId(page, 'm-forgot-link').click();
  await byId(page, 'm-forgot-email').fill('customer@example.com');
  await byId(page, 'm-send-code').click();
  await expect(byId(page, 'm-resend')).toContainText(/Resend in \d+s/);
  const code = (await byId(page, 'm-demo-code').innerText()).match(/\d{6}/)![0];
  await byId(page, 'm-reset-code').fill(code === '111111' ? '222222' : '111111');
  await byId(page, 'm-code-continue').click();
  await byId(page, 'm-reset-password').fill('Fresh#Trip2027');
  await byId(page, 'm-reset-confirm').fill('Fresh#Trip2027');
  await byId(page, 'm-reset-submit').click();
  await expect(page.getByText('The code is invalid or has expired')).toBeVisible();
  await byId(page, 'm-reset-code').fill(code);
  await byId(page, 'm-code-continue').click();
  await byId(page, 'm-reset-password').fill('Fresh#Trip2027');
  await byId(page, 'm-reset-confirm').fill('Fresh#Trip2027');
  await byId(page, 'm-reset-submit').click();
  await expect(byId(page, 'm-reset-success')).toBeVisible();
  await byId(page, 'm-back-to-login').click();
  await signIn(page, 'customer@example.com', 'Fresh#Trip2027');
  void DEMO_PASSWORD;
});
