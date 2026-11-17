import { ACCOUNTS, expect, nextPersist, pickOption, signIn, test } from '../fixtures';
import { selectFirst } from '../pages/controls';
import { uniqueEmail } from '../factories/data';
import { SearchResults } from '../pages/storefront';

/**
 * Platform and agency administration: create → read → update → deactivate, each change re-read after a reload,
 * and its effect checked where it matters (pricing, booking eligibility).
 */

test('promo codes: create, persist, apply in pricing (independent maths), deactivate', async ({ page }) => {
  // As Nile Horizon: net 1,000 → platform 6% (hidden) → agency 12% = 1,187.20 → promo 7% = −83.10 → VAT 14% → 1,258.67.
  const agencyPrice = 118_720;
  const discount = Math.round(agencyPrice * 0.07);
  const pre = agencyPrice - discount;
  const total = pre + Math.round(pre * 0.14);
  const code = `E2E${Date.now().toString(36).slice(-5).toUpperCase()}`;

  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/pricing');
  await page.getByRole('tab', { name: 'Promo codes' }).click();
  await page.getByRole('button', { name: 'New promo code' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name=promoCode]').fill(code.toLowerCase()); // normalised to upper case
  await expect(dialog.locator('input[name=promoCode]')).toHaveValue(code);
  await expect(dialog.getByText('Discount', { exact: true })).toBeVisible(); // labelled as a discount, not a markup
  await dialog.locator('input[name=promoValue]').fill('7');
  let stored = nextPersist(page);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await stored;
  await expect(dialog).toBeHidden();
  const row = page.getByTestId('promos-table').getByRole('row').filter({ hasText: code });
  await expect(row).toContainText('7%');
  await expect(row).toContainText('Active');

  await page.reload();
  await page.getByRole('tab', { name: 'Promo codes' }).click();
  await expect(page.getByTestId('promos-table').getByRole('row').filter({ hasText: code })).toBeVisible();

  // The code is honoured by the pricing engine.
  await page.getByTestId('tab-simulator').click();
  const sim = '[data-testid="simulator"]';
  await pickOption(page, 'ownership', 'network', sim);
  await pickOption(page, 'source', 'extranet', sim);
  await page.locator(`${sim} input[name=promoCode]`).fill(code);
  await page.getByTestId('simulate').click();
  await expect(page.getByTestId('price-breakdown').locator('[data-line=discount]')).toContainText(`EGP ${(discount / 100).toFixed(2)}`);
  await expect(page.getByTestId('customer-total')).toHaveText(`EGP ${(total / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  // Deactivate: persisted, and the engine stops applying it.
  await page.getByRole('tab', { name: 'Promo codes' }).click();
  await page.getByTestId('promos-table').getByRole('row').filter({ hasText: code }).getByRole('button').click();
  await pickOption(page, 'promoStatus', 'inactive');
  stored = nextPersist(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await stored;
  await page.reload();
  await page.getByRole('tab', { name: 'Promo codes' }).click();
  await expect(page.getByTestId('promos-table').getByRole('row').filter({ hasText: code })).toContainText('Inactive');
  await page.getByTestId('tab-simulator').click();
  await pickOption(page, 'ownership', 'network', sim);
  await pickOption(page, 'source', 'extranet', sim);
  await page.locator(`${sim} input[name=promoCode]`).fill(code);
  await page.getByTestId('simulate').click();
  await expect(page.getByText(/This promo code isn.t valid for this booking/)).toBeVisible(); // an inactive code is refused
});

test('KYC: the platform approves a pending agency, which can then book', async ({ page }) => {
  test.slow();
  // Before approval Red Sea (pending KYC) cannot book.
  await signIn(page, ACCOUNTS.otherAgencyOwner);
  const sheet = await (await new SearchResults(page).open('hotel', { base: '/en/agency/search' })).openOffer();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByText("Your account can't book or sell until its documents are approved and valid")).toBeVisible();
  await expect(page.getByTestId('cart-count')).toHaveCount(0);
  void sheet;

  await signIn(page, ACCOUNTS.platformAdmin);
  await page.goto('/en/admin/kyc');
  await page.getByRole('row').filter({ hasText: 'Red Sea Journeys' }).getByRole('button', { name: 'Review' }).click();
  const review = page.getByTestId('kyc-case');
  await expect(review).toBeVisible();
  await expect(page.getByTestId('kyc-approve')).toBeDisabled(); // every document must be accepted first
  for (let i = 0; i < 10 && (await review.locator('[data-accept]').count()) > 0; i++) {
    const before = await review.locator('[data-accept]').count();
    await review.locator('[data-accept]').first().click();
    await expect(review.locator('[data-accept]')).toHaveCount(before - 1);
  }
  await page.getByTestId('kyc-approve').click();
  await expect(page.getByText('Decision recorded').first()).toBeVisible();
  await page.goto('/en/admin/organizations');
  await expect(page.getByRole('row').filter({ hasText: 'Red Sea Journeys' })).toContainText('Active');

  await signIn(page, ACCOUNTS.otherAgencyOwner);
  await (await new SearchResults(page).open('hotel', { base: '/en/agency/search' })).openOffer();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
});

test('team: invite a member with a role; it persists and appears as invited', async ({ page }) => {
  const email = uniqueEmail('teammate');
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/team');
  await page.getByRole('button', { name: 'Invite member' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name=name]').fill('Mona Fares');
  await dialog.locator('input[name=email]').fill(email);
  await dialog.getByRole('button', { name: 'Invite member' }).click();
  await expect(dialog.getByText('This field is required')).toBeVisible(); // a role is required
  await selectFirst(page, dialog.getByTestId('select-roleId'));
  const stored = nextPersist(page);
  await dialog.getByRole('button', { name: 'Invite member' }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
  await stored;
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Invited');
});

test('sub-agencies: create one (one level only); the sub-agency cannot create its own', async ({ page }) => {
  const owner = uniqueEmail('sub-owner');
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/sub-agencies');
  await page.getByRole('button', { name: 'New sub-agency' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="name.en"]').fill('Aswan Trails');
  await dialog.locator('input[name="name.ar"]').fill('مسارات أسوان');
  await dialog.locator('input[name=legalName]').fill('Aswan Trails LLC');
  await dialog.locator('input[name=city]').fill('Aswan');
  await dialog.locator('input[name=contactEmail]').fill(uniqueEmail('aswan'));
  await dialog.locator('input[name=contactPhone]').fill('+20 97 230 0000');
  await dialog.locator('input[name="owner.name"]').fill('Hany Adel');
  await dialog.locator('input[name="owner.email"]').fill(owner);
  const stored = nextPersist(page);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(`Aswan Trails created — invitation sent to ${owner}`)).toBeVisible();
  await stored;
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'Aswan Trails' })).toBeVisible();

  // A sub-agency has no sub-agency management at all (the server refuses it too: security/tenancy.service.spec).
  await signIn(page, ACCOUNTS.subAgencyOwner);
  await expect(page.getByTestId('sidebar').getByRole('link', { name: 'Sub-agencies' })).toHaveCount(0);
});
