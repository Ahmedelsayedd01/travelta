import { expect, type Page } from '@playwright/test';
import { CARDS, isoDays } from '../factories/data';
import { pickDate, selectFirst, selectValue } from './controls';

/** 1×1 PNG used as a demo document scan. */
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export interface CardInput { number?: string; expiry?: string; cvc?: string; holder?: string; threeDsCode?: string }

/**
 * Checkout wizard for customers (`/account/checkout`: travellers → payment) and agencies (`/agency/checkout`:
 * customer → travellers → payment). Traveller forms are filled per service: names always; nationality, passport
 * and expiry for flights, visas and Umrah; birth dates for children; the activity time slot; the Umrah mahram.
 */
export class Checkout {
  constructor(readonly page: Page, readonly portal: 'account' | 'agency' = 'account') {}

  async open() {
    await this.page.goto(`/en/${this.portal}/checkout`);
    // Prices and availability are re-checked with the supplier before anything can be submitted.
    await expect(this.page.getByText('All prices and availability confirmed')).toBeVisible({ timeout: 30_000 });
    await this.next();
    // A customer never gets the staff-only "Choose a customer" step (regression: a quick Continue used to land there).
    if (this.portal === 'account') await expect(this.page.getByText('Choose a customer')).toHaveCount(0);
    if (this.portal === 'agency') {
      await this.page.getByTestId('customer-option').first().click();
      await this.next();
    }
    await expect(this.page.getByTestId('traveller-fields').first()).toBeVisible();
    return this;
  }

  next() { return this.page.getByTestId('checkout-next').click(); }

  /** Fill every traveller and service-detail field shown for the cart's items. */
  async fillTravellers(firstName = 'Sara', lastName = 'Ali') {
    const page = this.page;
    for (const input of await page.locator('input[name$=first]').all()) await input.fill(firstName);
    for (const input of await page.locator('input[name$=last]').all()) await input.fill(lastName);
    let i = 0;
    for (const nat of await page.locator('[data-testid^="select-t"][data-testid$="nat"]').all()) await selectValue(page, nat, 'EG');
    for (const passport of await page.locator('input[name$=passport]').all()) await passport.fill(`A${1000000 + i++}`);
    for (const expiry of await page.locator('[data-testid^="date-t"][data-testid$="pexp"]').all()) await pickDate(page, expiry, isoDays(800));
    for (const mahram of await page.locator('input[name$=mahram]').all()) await mahram.fill('Ali Hassan (husband)');
    for (const time of await page.locator('[data-testid^="select-d"][data-testid$="time"]').all()) await selectFirst(page, time);
    // Visas need at least one supporting document (a passport scan).
    for (const upload of await page.locator('[data-testid^="visa-doc-"]').all()) {
      await upload.setInputFiles({ name: 'passport-scan.png', mimeType: 'image/png', buffer: TINY_PNG });
    }
    // Children and infants need a birth date (adults' is optional).
    for (const dob of await page.locator('[data-testid^="date-t"][data-testid$="dob"]').all()) {
      if ((await dob.getAttribute('data-value')) === '' && (await dob.getAttribute('data-required'))) await pickDate(page, dob, isoDays(-365 * 8));
    }
    await this.next();
  }

  /** Customer card payment (demo simulator). */
  async payByCard(card: CardInput = {}) {
    const page = this.page;
    await page.locator('input[name=cardNumber]').fill(card.number ?? CARDS.ok);
    await page.locator('input[name=cardExpiry]').fill(card.expiry ?? '12/29');
    await page.locator('input[name=cardCvc]').fill(card.cvc ?? '123');
    await page.locator('input[name=cardHolder]').fill(card.holder ?? 'Sara Ali');
    await page.getByTestId('submit-booking').click();
  }

  /** Wait for the confirmation and return the booking reference. */
  async confirmationRef(): Promise<string> {
    const done = this.page.getByTestId('checkout-done');
    await expect(done).toBeVisible({ timeout: 30_000 });
    return (await done.innerText()).match(/TRV-\d{4}-\d{5}/)![0];
  }
}
