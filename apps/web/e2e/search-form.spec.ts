import { expect, pickOption, test } from './fixtures';

const CATEGORIES = ['hotel', 'flight', 'tour', 'activity', 'transfer', 'visa', 'umrah'] as const;

test('each category shows its own fields and its own cards and photos', async ({ page }) => {
  await page.goto('/en');
  const form = page.getByTestId('hero-search').getByTestId('search-form');
  const showcase = page.getByTestId('category-showcase');
  for (const s of CATEGORIES) {
    await form.locator(`[role=tab][data-service="${s}"]`).click();
    await expect(form).toHaveAttribute('data-service', s);
    await expect(form.locator(`[role=tab][data-service="${s}"]`)).toHaveAttribute('aria-selected', 'true');
    // Fields
    await expect(form.getByTestId('date-to')).toHaveCount(s === 'hotel' ? 1 : 0);
    await expect(form.getByTestId('select-fromCode')).toHaveCount(s === 'flight' ? 1 : 0);
    await expect(form.getByTestId('rooms')).toHaveCount(s === 'hotel' ? 1 : 0);
    await expect(form.getByTestId('select-nationality')).toHaveCount(['hotel', 'visa', 'umrah'].includes(s) ? 1 : 0);
    // Cards: the showcase follows the category with that category's card and photos.
    await expect(showcase).toHaveAttribute('data-service', s);
    const cards = showcase.getByTestId('category-card');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const services = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-service')));
    expect(new Set(services)).toEqual(new Set([s]));
    const photos = await cards.evaluateAll((els) => els.map((e) => e.querySelector('[data-photo]')?.getAttribute('data-photo') ?? ''));
    expect(photos.every((p) => p.startsWith(`${s}-`))).toBe(true);
  }
  // Category-specific content, not just labels.
  await form.locator('[role=tab][data-service="flight"]').click();
  await expect(showcase.getByTestId('flight-times').first()).toBeVisible();
  await form.locator('[role=tab][data-service="visa"]').click();
  await expect(showcase.getByText(/processing/).first()).toBeVisible();
  await form.locator('[role=tab][data-service="umrah"]').click();
  await expect(showcase.getByText(/Makkah · \d+ nights/).first()).toBeVisible();
});

test('validation: nothing before interaction, errors on submit next to fields, cleared when fixed', async ({ page }) => {
  await page.goto('/en/search');
  const form = page.getByTestId('search-form');
  await form.locator('[role=tab][data-service="visa"]').click();
  await expect(form.getByRole('alert')).toHaveCount(0);
  await form.getByTestId('search-submit').click();
  await expect(form.getByText("Choose the traveller's nationality")).toBeVisible();
  await expect(page.getByTestId('search-errors')).toBeVisible();
  await expect(form.getByTestId('select-nationality')).toBeFocused();
  await expect(page).toHaveURL(/\/en\/search$/); // nothing was searched
  await pickOption(page, 'nationality', 'EG');
  await expect(form.getByText("Choose the traveller's nationality")).toHaveCount(0);
  await form.getByTestId('search-submit').click();
  await expect(page).toHaveURL(/\/search\?s=/);
  await expect(page.getByTestId('search-result').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('search-result').first().getByTestId('category-facts')).toHaveAttribute('data-service', 'visa');
});

test('flights: same departure and arrival airport is rejected; swap and fix work', async ({ page }) => {
  await page.goto('/en/search');
  const form = page.getByTestId('search-form');
  await form.locator('[role=tab][data-service="flight"]').click();
  await pickOption(page, 'toCode', 'CAI');
  await expect(form.getByText('Departure and arrival must be different airports')).toBeVisible();
  await pickOption(page, 'toCode', 'IST');
  await expect(form.getByText('Departure and arrival must be different airports')).toHaveCount(0);
  await form.getByTestId('swap-route').click();
  await expect(form.getByTestId('select-fromCode')).toHaveAttribute('data-value', 'IST');
  await expect(form.getByTestId('select-toCode')).toHaveAttribute('data-value', 'CAI');
  await form.getByTestId('search-submit').click();
  // The swapped route reaches the search. (IST → CAI flies Mon/Wed/Fri only, so whether offers exist depends on the
  // default date's weekday; the criteria in the URL do not.)
  await expect.poll(() => JSON.parse(new URL(page.url()).searchParams.get('s') ?? '{}')).toMatchObject({ serviceType: 'flight', fromCode: 'IST', toCode: 'CAI' });
  await expect(page.getByTestId('search-result').first().or(page.getByText('No offers match'))).toBeVisible();
});

test('date picker: past dates disabled, check-out follows check-in, keyboard works', async ({ page }) => {
  await page.goto('/en/search');
  const form = page.getByTestId('search-form');
  await form.getByTestId('date-from').click();
  const cal = page.getByTestId('date-from-popup');
  await expect(cal).toBeVisible();
  // Any disabled day in view is before today.
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const disabled = cal.locator('button[data-day][disabled]');
  if (await disabled.count()) expect((await disabled.first().getAttribute('data-day'))! < today).toBe(true);
  // Keyboard: arrow right then Enter picks the next day.
  const selected = await form.getByTestId('date-from').getAttribute('data-value');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(cal).toBeHidden();
  const next = await form.getByTestId('date-from').getAttribute('data-value');
  expect(next! > selected!).toBe(true);
  // Move check-in past check-out: check-out moves along and stays valid.
  const out = (await form.getByTestId('date-to').getAttribute('data-value'))!;
  await form.getByTestId('date-from').click();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const inDate = (await form.getByTestId('date-from').getAttribute('data-value'))!;
  const outDate = (await form.getByTestId('date-to').getAttribute('data-value'))!;
  expect(inDate > out).toBe(true);
  expect(outDate > inDate).toBe(true);
  await expect(form.getByRole('alert')).toHaveCount(0);
  // Check-out calendar: days up to check-in are disabled.
  await form.getByTestId('date-to').click();
  await expect(page.getByTestId('date-to-popup').locator(`button[data-day="${inDate}"]`)).toBeDisabled();
});

test('tabs and selects are keyboard operable', async ({ page }) => {
  await page.goto('/en/search');
  const form = page.getByTestId('search-form');
  await form.locator('[role=tab][data-service="hotel"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(form).toHaveAttribute('data-service', 'flight');
  await expect(form.locator('[role=tab][data-service="flight"]')).toBeFocused();
  await form.getByTestId('select-toCode').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[role=listbox]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=listbox]')).toBeHidden();
});

test('Arabic: right-to-left form, mirrored tab keys and Arabic validation messages', async ({ page }) => {
  await page.goto('/ar/search');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const form = page.getByTestId('search-form');
  await form.locator('[role=tab][data-service="flight"]').focus();
  await page.keyboard.press('ArrowLeft'); // next in RTL
  await expect(form).toHaveAttribute('data-service', 'tour');
  await form.locator('[role=tab][data-service="visa"]').click();
  await form.getByTestId('search-submit').click();
  await expect(form.getByText('اختر جنسية المسافر')).toBeVisible();
});

test('reduced motion turns the category transition off', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/en/search');
  await page.getByTestId('search-form').locator('[role=tab][data-service="tour"]').click();
  const anim = await page.locator('#search-fields').evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('none');
  await ctx.close();
});
