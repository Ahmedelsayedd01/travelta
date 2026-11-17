import { expect, type Locator, type Page } from '@playwright/test';
import { searchUrl } from '../fixtures';

export type Service = 'hotel' | 'flight' | 'tour' | 'visa' | 'umrah' | 'activity' | 'transfer';

/** Searchable destination per service in the seeded catalogue. */
export const SERVICE_DESTINATIONS: Record<Service, string> = { hotel: 'LXR', flight: 'DXB', tour: 'LXR', visa: 'DXB', umrah: 'MKX', activity: 'HRG', transfer: 'HRG' };
export const SERVICES = Object.keys(SERVICE_DESTINATIONS) as Service[];

/** Search results page (storefront `/search`, or the agency's `/agency/search`). */
export class SearchResults {
  readonly results: Locator;
  constructor(readonly page: Page) { this.results = page.getByTestId('search-result'); }

  /** Open results through a deep link (criteria in `?s=`); `extra` overrides form defaults (e.g. dates). */
  async open(service: Service, opts: { base?: string; locale?: string; destinationCode?: string; from?: string; to?: string } = {}) {
    const base = opts.base ?? `/${opts.locale ?? 'en'}/search`;
    await this.page.goto(searchUrl(base, { serviceType: service, destinationCode: opts.destinationCode ?? SERVICE_DESTINATIONS[service], ...(opts.from ? { from: opts.from } : {}), ...(opts.to ? { to: opts.to } : {}) }));
    await expect(this.results.first().or(this.page.getByText(/No offers match/))).toBeVisible({ timeout: 30_000 });
    return this;
  }

  /** Open the first result (or one matching `hasText`) and return the offer sheet. */
  async openOffer(hasText?: string | RegExp): Promise<OfferSheet> {
    const card = hasText ? this.results.filter({ hasText }).first() : this.results.first();
    await card.getByTestId('open-offer').click();
    const sheet = new OfferSheet(this.page);
    await expect(sheet.root).toBeVisible();
    return sheet;
  }
}

/** Product details sheet: options, policy, breakdown and Add to cart. */
export class OfferSheet {
  readonly root: Locator;
  constructor(readonly page: Page) { this.root = page.getByTestId('offer-sheet'); }
  options() { return this.root.getByTestId('offer-option'); }
  async chooseOption(hasText?: string | RegExp) {
    const option = hasText ? this.options().filter({ hasText }).first() : this.options().first();
    await option.click();
  }
  /** Add the chosen option to the cart and wait for the cart badge to show `expectedCount`. */
  async addToCart(expectedCount = 1) {
    const add = this.page.getByTestId('add-to-cart');
    await expect(add).toBeEnabled();
    await add.click();
    await expect(this.page.getByTestId('cart-count')).toHaveText(String(expectedCount));
  }
}
