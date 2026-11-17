import { chooseOption, expect, searchUrl, signIn, test, ACCOUNTS } from '../fixtures';

/** Scenario A — the platform admin manages a hotel end to end and public search follows its status. */
test('platform admin creates, edits, deactivates, reactivates, archives and deletes a hotel', async ({ page }) => {
  const name = 'E2E Karnak Riverside';
  await signIn(page, ACCOUNTS.platformAdmin);
  await page.goto('/en/admin/catalog');
  await page.getByTestId('new-product').click();
  const editor = page.getByTestId('product-editor');
  await chooseOption(page, editor.getByTestId('product-owner'), { label: 'Pharaoh Stays Group · Supplier' });
  await editor.locator('input[name=nameEn]').fill(name);
  await editor.locator('input[name=nameAr]').fill('كرنك ريفرسايد');
  await editor.locator('textarea[name=descEn]').fill('Riverside hotel steps from Karnak Temple.');
  await editor.locator('textarea[name=descAr]').fill('فندق على النيل بالقرب من معبد الكرنك.');
  await chooseOption(page, editor.getByTestId('select-destinationId'), { label: 'Luxor' });
  // Location: set the pin from the destination centre, then fine-tune the coordinates.
  await editor.getByTestId('use-centre').click();
  await editor.locator('input[name=lat]').fill('25.7101');
  await editor.locator('input[name=lng]').fill('32.6450');
  await expect(editor.getByTestId('location-picker').locator('[data-marker-kind=pin]')).toBeVisible();
  // A second room type.
  await editor.getByRole('button', { name: 'Add option' }).click();
  await editor.locator('input[name=unit1NameEn]').fill('Nile view suite');
  await editor.locator('input[name=unit1NameAr]').fill('جناح بإطلالة نيلية');
  await page.getByTestId('product-save').click();
  await expect(page.getByText('Product saved')).toBeVisible();

  const row = page.getByTestId('products-table').locator('tr, li').filter({ hasText: name }).first();
  await page.getByRole('searchbox').first().fill(name);
  await expect(row).toBeVisible();

  // Edit: rename.
  await row.getByTestId('edit-product').click();
  await page.getByTestId('product-editor').locator('input[name=nameEn]').fill(`${name} & Spa`);
  await page.getByTestId('product-save').click();
  await page.getByRole('searchbox').first().fill(`${name} & Spa`);
  const edited = page.getByTestId('products-table').locator('tr, li').filter({ hasText: `${name} & Spa` }).first();
  await expect(edited).toBeVisible();

  // Draft → live: publish, then it appears in public search with its map position.
  await edited.getByTestId('publish-product').click();
  await expect(edited.getByText('Live')).toBeVisible();
  const results = searchUrl('/en/search', { destinationCode: 'LXR' });
  await page.goto(results);
  await expect(page.getByTestId('search-result').filter({ hasText: `${name} & Spa` })).toHaveCount(1, { timeout: 30_000 });

  // Deactivate → hidden; reactivate → back.
  await page.goto('/en/admin/catalog');
  await page.getByRole('searchbox').first().fill(`${name} & Spa`);
  await edited.getByTestId('pause-product').click();
  await expect(edited.getByText('Paused')).toBeVisible();
  await page.goto(results);
  await expect(page.getByTestId('results-count')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('search-result').filter({ hasText: `${name} & Spa` })).toHaveCount(0);
  await page.goto('/en/admin/catalog');
  await page.getByRole('searchbox').first().fill(`${name} & Spa`);
  await edited.getByTestId('publish-product').click();
  await expect(edited.getByText('Live')).toBeVisible();
  await page.goto(results);
  await expect(page.getByTestId('search-result').filter({ hasText: `${name} & Spa` })).toHaveCount(1, { timeout: 30_000 });

  // Archive (soft delete) → hidden; then the never-booked product can be deleted for good.
  await page.goto('/en/admin/catalog');
  await page.getByRole('searchbox').first().fill(`${name} & Spa`);
  await edited.getByTestId('archive-product').click();
  await expect(edited.getByText('Archived')).toBeVisible();
  await edited.getByTestId('delete-product').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Product deleted')).toBeVisible();
  await expect(page.getByTestId('products-table').locator('tr, li').filter({ hasText: `${name} & Spa` })).toHaveCount(0);

  // Every change is in the audit log.
  await page.goto('/en/admin/audit-log');
  await expect(page.getByText(/catalog\.product_deleted|Product deleted/).first()).toBeVisible();
});

test('platform admin manages locations: destination with coordinates and a place on the map', async ({ page }) => {
  await signIn(page, ACCOUNTS.platformAdmin);
  await page.goto('/en/admin/locations');
  await page.getByTestId('new-destination').click();
  const ed = page.getByTestId('destination-editor');
  await ed.locator('input[name=code]').fill('FAY');
  await ed.locator('input[name=nameEn]').fill('Fayoum');
  await ed.locator('input[name=nameAr]').fill('الفيوم');
  await ed.locator('input[name=lat]').fill('29.3084');
  await ed.locator('input[name=lng]').fill('30.8428');
  await page.getByTestId('destination-save').click();
  await expect(page.getByText('Location saved')).toBeVisible();
  await expect(page.getByTestId('destinations-table').getByText('Fayoum').first()).toBeVisible();

  await page.getByTestId('tab-places').click();
  await chooseOption(page, page.getByTestId('select-placesDestination'), { label: 'Fayoum' });
  await page.getByTestId('new-place').click();
  const pe = page.getByTestId('place-editor');
  await pe.locator('input[name=nameEn]').fill('Wadi El Rayan');
  await pe.locator('input[name=nameAr]').fill('وادي الريان');
  // Swapped lat/lng is rejected by the server (too far from the destination).
  await pe.locator('input[name=lat]').fill('30.3');
  await pe.locator('input[name=lng]').fill('29.2');
  await page.getByTestId('place-save').click();
  await expect(page.getByText(/too far|km from Fayoum/i).first()).toBeVisible();
  await pe.locator('input[name=lat]').fill('29.2');
  await pe.locator('input[name=lng]').fill('30.4');
  await page.getByTestId('place-save').click();
  await expect(page.getByTestId('places-list').getByText('Wadi El Rayan')).toBeVisible();
  await expect(page.getByTestId('places-map').locator('[data-marker-kind]')).toHaveCount(1);
});

test('platform admin edits an agency profile and the change is audited', async ({ page }) => {
  await signIn(page, ACCOUNTS.platformAdmin);
  await page.goto('/en/admin/organizations');
  await page.getByRole('searchbox').first().fill('Sunrise');
  await page.getByText('Sunrise Tours').first().click();
  await page.getByTestId('edit-org').click();
  const form = page.getByTestId('org-profile-form');
  await form.locator('input[name=city]').fill('6th of October');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await page.goto('/en/admin/audit-log');
  await expect(page.getByText(/organization\.updated_by_platform|updated by platform/i).first()).toBeVisible();
});
