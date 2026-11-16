import { byId, expect, test } from './fixtures';

test.use({ onboarding: true });

test('first launch shows onboarding with photos; next / previous / get started; completion persists', async ({ page }) => {
  await page.goto('/');
  await expect(byId(page, 'onboarding')).toBeVisible();
  await expect(byId(page, 'onboarding-title')).toHaveText('Discover your next destination');
  await expect(byId(page, 'onboarding-image-discover')).toBeVisible();
  await expect(byId(page, 'onboarding-previous')).toHaveCount(0);
  await byId(page, 'onboarding-next').click();
  await expect(byId(page, 'onboarding-title')).toHaveText('Everything you need in one place');
  await byId(page, 'onboarding-previous').click();
  await expect(byId(page, 'onboarding-title')).toHaveText('Discover your next destination');
  await byId(page, 'onboarding-next').click();
  await byId(page, 'onboarding-next').click();
  await expect(byId(page, 'onboarding-title')).toHaveText('Your journey starts here');
  await byId(page, 'onboarding-next').click();
  await expect(byId(page, 'onboarding-title')).toHaveText('Travel more. Worry less.');
  await expect(byId(page, 'onboarding-skip')).toHaveCount(0);
  await byId(page, 'onboarding-start').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  await expect(byId(page, 'onboarding')).toHaveCount(0);
});

test('skip goes straight home and is remembered', async ({ page }) => {
  await page.goto('/');
  await byId(page, 'onboarding-skip').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
});
