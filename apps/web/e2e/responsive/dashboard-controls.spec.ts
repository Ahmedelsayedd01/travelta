import { expect, expectAccessible, expectNoHorizontalOverflow, pickOption, signIn, test, ACCOUNTS, waitForContent } from '../fixtures';

/** Dashboard selects and date fields use the design-system SelectField / DatePicker instead of native browser controls. */

test('no native selects or date inputs are visible on business dashboards', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  for (const path of ['/en/agency/accounting', '/en/agency/reports', '/en/agency/settings', '/en/agency/team', '/en/agency/pricing', '/en/agency/crm']) {
    await page.goto(path);
    await waitForContent(page);
    await expect(page.locator('select:visible'), path).toHaveCount(0);
    await expect(page.locator('input[type=date]:visible'), path).toHaveCount(0);
  }
});

test('form select (react-hook-form register): change, save, read back after reload', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/settings');
  const form = page.getByTestId('org-profile-form');
  const trigger = form.getByTestId('select-baseCurrency');
  const before = await trigger.getAttribute('data-value');
  const next = before === 'USD' ? 'EGP' : 'USD';
  await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
  await pickOption(page, 'baseCurrency', next, '[data-testid="org-profile-form"]');
  await expect(form.locator('select[name=baseCurrency]')).toHaveValue(next); // the hidden native select carries the value
  // The in-browser demo backend stores its snapshot just after each write and then tells other tabs (BroadcastChannel);
  // wait for that message so the reload reads the stored data.
  const persisted = page.evaluate(() => new Promise<void>((resolve) => {
    const channel = new BroadcastChannel('travelta-db');
    channel.onmessage = () => { channel.close(); resolve(); };
  }));
  await form.getByRole('button', { name: 'Save' }).click(); // enabled: the form saw the change as dirty
  await expect(page.getByText('Organization profile saved')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled(); // clean again after saving
  await persisted;
  await page.reload();
  await expect(page.getByTestId('org-profile-form').getByTestId('select-baseCurrency')).toHaveAttribute('data-value', next);
});

test('select keyboard use: open with the keyboard, type ahead, choose with Enter', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/settings');
  const trigger = page.getByTestId('org-profile-form').getByTestId('select-baseCurrency');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  const sar = page.getByRole('option', { name: 'SAR' });
  // Type ahead once the opened list has focus (it animates in); retried like a user who sees nothing highlighted yet.
  await expect(async () => {
    await page.keyboard.press('s');
    await expect(sar).toHaveAttribute('data-highlighted', '', { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('data-value', 'SAR');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('date filters: calendar with month/year jump, the result drives the report, optional dates clear', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/accounting');
  const from = page.getByTestId('date-from');
  await expect(from).toHaveAttribute('data-value', '');
  await from.click();
  const popup = page.getByTestId('date-from-popup');
  await expect(popup.getByTestId('calendar')).toBeVisible();
  // Jump to January of last year with the header dropdowns.
  const lastYear = String(new Date().getFullYear() - 1);
  await popup.getByTestId('calendar-year-select').click();
  await page.locator(`[role=option][data-value="${lastYear}"]`).click();
  await popup.getByTestId('calendar-month-select').click();
  await page.locator('[role=option][data-value="0"]').click();
  await expect(popup.getByTestId('calendar-month')).toHaveText(`January ${lastYear}`);
  await popup.locator(`button[data-day="${lastYear}-01-15"]`).click();
  await expect(popup).toHaveCount(0);
  await expect(from).toHaveAttribute('data-value', `${lastYear}-01-15`);
  await expect(from).toContainText(`Jan 15, ${lastYear}`);
  await expect(page.getByRole('button', { name: 'All time' })).toBeVisible(); // the page reacted to the new filter
  // Optional filter: a clear button resets it.
  await page.getByTestId('date-from-clear').click();
  await expect(from).toHaveAttribute('data-value', '');
  await expect(page.getByTestId('date-from-clear')).toHaveCount(0);
});

test('date range: the second date cannot be before the first (min/max carried to the calendar)', async ({ page }) => {
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/reports');
  await waitForContent(page);
  const from = page.getByTestId('date-from');
  const to = page.getByTestId('date-to');
  if (await from.count() === 0) test.skip(true, 'the default report has no date range');
  const fromValue = (await from.getAttribute('data-value'))!;
  await to.click();
  const popup = page.getByTestId('date-to-popup');
  // Walk back to the month of the start date; going further back is blocked.
  const prev = popup.getByTestId('calendar-prev');
  while (await prev.isEnabled()) await prev.click();
  await expect(popup.locator(`button[data-day="${fromValue}"]`)).toBeEnabled();
  const day = new Date(`${fromValue}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  const before = popup.locator(`button[data-day="${day.toISOString().slice(0, 10)}"]`);
  if (await before.count()) await expect(before).toBeDisabled(); // shown when the start date isn't the first cell of the grid
  await page.keyboard.press('Escape');
});

test('Arabic, dark: selects and calendar open right-to-left and pass axe while open', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/ar/agency/accounting');
  await waitForContent(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expectAccessible(page);
  await page.getByTestId('date-from').click();
  const cal = page.getByTestId('date-from-popup');
  await expect(cal.getByTestId('calendar')).toBeVisible();
  await expect(cal.getByRole('columnheader').first()).toHaveAttribute('aria-label', 'السبت'); // week starts on Saturday
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await page.goto('/ar/agency/settings');
  await page.getByTestId('org-profile-form').getByTestId('select-baseCurrency').click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expectAccessible(page);
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('dashboard date and select controls fit without sideways scrolling', async ({ page }) => {
    await signIn(page, ACCOUNTS.agencyOwner);
    for (const path of ['/en/agency/accounting', '/en/agency/settings']) {
      await page.goto(path);
      await waitForContent(page);
      await expectNoHorizontalOverflow(page);
    }
    await page.goto('/en/agency/accounting');
    await page.getByTestId('date-from').click();
    const box = await page.getByTestId('date-from-popup').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });
});
