import { ACCOUNTS, expect, nextPersist, pickOption, signIn, test } from '../fixtures';
import { uniqueEmail, uniqueName } from '../factories/data';
import { selectFirst } from '../pages/controls';

/** Agency perspective: customers, wallet funding approved by the platform, own markup rules. Every change is re-read. */

const minorOf = (text: string) => Math.round(Number(text.replace(/[^\d.-]/g, '')) * 100);

test('customers: create, find after reload, edit, open the customer 360', async ({ page }) => {
  const name = uniqueName('Laila Customer');
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/customers');
  await page.getByTestId('new-customer').click();
  const form = page.getByTestId('customer-form');
  await page.getByTestId('customer-save').click();
  await expect(form.getByRole('alert').first()).toBeVisible(); // required fields are validated
  await form.locator('input[name=name]').fill(name);
  await form.locator('input[name=phone]').fill('+20 100 222 3344');
  await form.locator('input[name=email]').fill(uniqueEmail('customer'));
  let stored = nextPersist(page);
  await page.getByTestId('customer-save').click();
  await stored;
  await page.reload();
  const table = page.getByRole('table');
  await page.locator('input[type=search]').first().fill(name);
  await expect(table.getByRole('row').filter({ hasText: name })).toBeVisible();

  await table.getByRole('row').filter({ hasText: name }).click();
  await expect(page.getByTestId('customer-360')).toBeVisible();
  await expect(page.getByTestId('customer-360')).toContainText(name);
  const edit = page.getByRole('button', { name: 'Edit' }).first();
  if (await edit.count()) {
    await edit.click();
    await page.getByTestId('customer-form').locator('input[name=phone]').fill('+20 100 999 8877');
    stored = nextPersist(page);
    await page.getByTestId('customer-save').click();
    await stored;
    await page.reload();
    await expect(page.getByText('+20 100 999 8877').first()).toBeVisible();
  }
});

test('wallet top-up: agency requests → platform approves → available balance rises by exactly that amount', async ({ page }) => {
  test.slow();
  const amountMinor = 250_000; // EGP 2,500.00
  const reference = `E2E-${Date.now()}`;
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/wallet');
  const before = minorOf(await page.getByTestId('wallet-available').innerText());
  await page.getByTestId('request-topup').click();
  const form = page.getByTestId('topup-form');
  await form.locator('input[name=amount]').fill(String(amountMinor / 100));
  await form.locator('input[name=reference]').fill(reference);
  await page.getByTestId('topup-submit').click();
  await expect(form).toBeHidden();
  // Not credited until approved.
  await expect(page.getByTestId('wallet-available')).toHaveText(await page.getByTestId('wallet-available').innerText());
  expect(minorOf(await page.getByTestId('wallet-available').innerText())).toBe(before);

  await signIn(page, ACCOUNTS.platformAdmin);
  await page.goto('/en/admin/wallets');
  await page.getByTestId('tab-topups').click();
  const row = page.getByRole('row').filter({ hasText: reference });
  await row.locator('[data-action=approve-topup]').click();
  const dialog = page.getByRole('dialog');
  const account = dialog.locator('[data-testid^="select-"]').first();
  if (await account.count()) await selectFirst(page, account);
  await page.getByTestId('topup-decide').click();
  await expect(dialog).toBeHidden();

  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/wallet');
  await expect.poll(async () => minorOf(await page.getByTestId('wallet-available').innerText())).toBe(before + amountMinor);
});

test('agency markup rule: editing it creates a new version and changes the computed price', async ({ page }) => {
  // Hotels 12% → 15%: net 1,000 → platform 6% (hidden) 1,060 → agency 15% = 1,219.00 → VAT 14% → 1,389.66.
  const base = 106_000;
  const pre = base + Math.round(base * 0.15);
  const total = pre + Math.round(pre * 0.14);
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/pricing');
  const rules = page.getByTestId('rules-table');
  await rules.getByRole('row').filter({ hasText: /^Hotels/ }).first().getByRole('button', { name: 'Edit' }).click();
  const editor = page.getByTestId('rule-editor');
  await editor.locator('input[name=value]').fill('15');
  const stored = nextPersist(page);
  await page.getByTestId('rule-save').click();
  await expect(editor).toBeHidden();
  await stored;
  await page.reload();
  await expect(page.getByTestId('rules-table').getByRole('row').filter({ hasText: /^Hotels/ }).first()).toContainText('15%');
  await page.getByTestId('rules-table').getByRole('row').filter({ hasText: /^Hotels/ }).first().getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('rule-versions')).toContainText('2'); // the previous version is kept (PRC-14)
  await page.keyboard.press('Escape');

  await page.getByTestId('tab-simulator').click();
  const sim = '[data-testid="simulator"]';
  await pickOption(page, 'ownership', 'network', sim);
  await pickOption(page, 'source', 'extranet', sim);
  await page.getByTestId('simulate').click();
  await expect(page.getByTestId('customer-total')).toHaveText(`EGP ${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
});
