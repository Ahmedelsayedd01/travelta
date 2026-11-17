import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Design-system controls (Base UI Select / DatePicker) driven like a user: open, then click an option or a day.
 */

/** The open popup list of a SelectField (each popup carries `<trigger testid>-list`; a closing one may linger). */
async function listOf(page: Page, trigger: Locator): Promise<Locator> {
  const id = await trigger.getAttribute('data-testid');
  // Several pickers can share a list id (calendar month/year); the newest visible one is the open list.
  const list = (id ? page.getByTestId(`${id}-list`) : page.locator('[role=listbox]')).filter({ visible: true }).last();
  await expect(list).toBeVisible();
  return list;
}

/** Choose `value` in the SelectField whose trigger is `trigger`. */
export async function selectValue(page: Page, trigger: Locator, value: string) {
  await trigger.click();
  await listOf(page, trigger).then((list) => list.locator(`[role=option][data-value="${value}"]`).click());
  await expect(trigger).toHaveAttribute('data-value', value);
}

/** Choose the first non-empty option of a SelectField. Returns the chosen value. */
export async function selectFirst(page: Page, trigger: Locator): Promise<string> {
  await trigger.click();
  const option = (await listOf(page, trigger)).locator('[role=option]:not([data-disabled])');
  const target = (await option.first().getAttribute('data-value')) === '' ? option.nth(1) : option.first();
  const value = (await target.getAttribute('data-value'))!;
  await target.click();
  await expect(trigger).toHaveAttribute('data-value', value);
  return value;
}

/**
 * Pick an ISO date in the DatePicker whose trigger is `trigger`: jumps with the month/year dropdowns when the calendar
 * has them, otherwise pages with next/previous.
 */
export async function pickDate(page: Page, trigger: Locator, iso: string) {
  await trigger.click();
  const testId = await trigger.getAttribute('data-testid');
  const popup = page.getByTestId(`${testId}-popup`);
  await expect(popup.getByTestId('calendar')).toBeVisible();
  const [y, m] = iso.split('-').map(Number) as [number, number];
  const yearSelect = popup.getByTestId('calendar-year-select');
  if (await yearSelect.count()) {
    await selectValue(page, yearSelect, String(y));
    await selectValue(page, popup.getByTestId('calendar-month-select'), String(m - 1));
  } else {
    for (let i = 0; i < 24 && (await popup.locator(`button[data-day="${iso}"]`).count()) === 0; i++) {
      const shown = await popup.locator('button[data-day]').nth(10).getAttribute('data-day');
      await popup.getByTestId(shown! < iso ? 'calendar-next' : 'calendar-prev').click();
    }
  }
  await popup.locator(`button[data-day="${iso}"]`).click();
  await expect(trigger).toHaveAttribute('data-value', iso);
}
