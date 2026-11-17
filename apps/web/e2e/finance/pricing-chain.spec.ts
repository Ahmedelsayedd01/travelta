import type { Page } from '@playwright/test';
import { ACCOUNTS, chooseOption, expect, pickOption, signIn, test } from '../fixtures';

/**
 * Pricing hierarchy (PRICING_ENGINE §1–§6): Supplier net → platform markup → agency markup → sub-agency markup →
 * tax → customer. Expected values are computed HERE, independently of the app's engine, from the seeded demo rules:
 *
 *   platform: Nile Horizon hotels 6% (rule) · Umrah 4% (rule) · otherwise API 8% / network 5% (platform defaults) ·
 *             never on agency-own stock
 *   agency (Nile Horizon): hotels 12% · tours +EGP 150 per person (fixed) · otherwise 10% (default)
 *   sub-agency (Delta Gate): 5% on the agency's price
 *   tax: VAT 14%, exclusive, on the full selling price, for hotel/tour/activity/transfer/umrah (not flights/visas)
 *   arithmetic: integer minor units, half-up after each layer and line (MON-2).
 */
const pct = (minor: number, p: number) => Math.round((minor * p) / 100);
const egp = (minor: number) => `EGP ${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TAXED = new Set(['hotel', 'tour', 'activity', 'transfer', 'umrah']);

interface Case { name: string; service: string; ownership: 'api' | 'network' | 'agency_own'; source: string; unit: string; netMinor: number; qty: number;
  platform: (unitNet: number) => number; agency: (unitBase: number) => number }

/** Expected per-line amounts for a whole sale (quantity × unit), computed per unit then multiplied, as the engine documents. */
function expected(c: Case) {
  const platformUnit = c.ownership === 'agency_own' ? 0 : c.platform(c.netMinor);
  const agencyUnit = c.agency(c.netMinor + platformUnit);
  const pre = (c.netMinor + platformUnit + agencyUnit) * c.qty;
  const tax = TAXED.has(c.service) ? pct(pre, 14) : 0;
  return { platform: platformUnit * c.qty, agency: agencyUnit * c.qty, tax, total: pre + tax };
}

const CASES: Case[] = [
  { name: 'hotel, network supplier: platform rule 6% then agency 12%, VAT 14%', service: 'hotel', ownership: 'network', source: 'extranet', unit: 'room_night', netMinor: 100_000, qty: 1, platform: (n) => pct(n, 6), agency: (b) => pct(b, 12) },
  { name: 'hotel, agency-own stock: no platform markup (approved rule), agency 12%', service: 'hotel', ownership: 'agency_own', source: 'manual', unit: 'room_night', netMinor: 100_000, qty: 1, platform: () => 0, agency: (b) => pct(b, 12) },
  { name: 'tour from an API supplier, 2 people: platform default 8%, agency fixed EGP 150 per person', service: 'tour', ownership: 'api', source: 'tbo', unit: 'pax', netMinor: 50_000, qty: 2, platform: (n) => pct(n, 8), agency: () => 15_000 },
  { name: 'activity from an API supplier: platform default 8%, agency default 10%', service: 'activity', ownership: 'api', source: 'tbo', unit: 'ticket', netMinor: 100_000, qty: 1, platform: (n) => pct(n, 8), agency: (b) => pct(b, 10) },
  { name: 'flight from an API supplier: no VAT on flights', service: 'flight', ownership: 'api', source: 'tbo', unit: 'seat', netMinor: 100_000, qty: 1, platform: (n) => pct(n, 8), agency: (b) => pct(b, 10) },
  { name: 'umrah from a network supplier: platform Umrah rule 4%, agency default 10%', service: 'umrah', ownership: 'network', source: 'extranet', unit: 'pax', netMinor: 100_000, qty: 1, platform: (n) => pct(n, 4), agency: (b) => pct(b, 10) },
];

async function simulate(page: Page, c: Pick<Case, 'service' | 'ownership' | 'source' | 'unit' | 'netMinor' | 'qty'>, opts: { agency?: string; subAgency?: string } = {}) {
  const form = page.getByTestId('simulator');
  const scope = '[data-testid="simulator"]';
  await pickOption(page, 'serviceType', c.service, scope);
  await pickOption(page, 'ownership', c.ownership, scope);
  await pickOption(page, 'source', c.source, scope);
  await pickOption(page, 'unitType', c.unit, scope);
  await form.locator('input[name=netAmount]').fill(String(c.netMinor / 100));
  await form.locator('input[name=quantity]').fill(String(c.qty));
  if (opts.agency) await chooseOption(page, form.getByTestId('select-agencyId'), { label: opts.agency });
  if (opts.subAgency) await chooseOption(page, form.getByTestId('select-subAgencyId'), { label: opts.subAgency });
  await page.getByTestId('simulate').click();
  await expect(page.getByTestId('price-breakdown')).toBeVisible();
}

const line = (page: Page, key: string) => page.getByTestId('price-breakdown').locator(`[data-line="${key}"]`);

test.describe('price chain (platform view, selling as Nile Horizon)', () => {
  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      const e = expected(c);
      await signIn(page, ACCOUNTS.platformAdmin);
      await page.goto('/en/admin/pricing');
      await page.getByTestId('tab-simulator').click();
      await simulate(page, c, { agency: 'Nile Horizon Travel' });
      if (e.platform) await expect(line(page, 'platform_markup')).toContainText(egp(e.platform));
      else await expect(line(page, 'platform_markup')).toHaveCount(0);
      await expect(line(page, 'agency_markup')).toContainText(egp(e.agency));
      if (e.tax) await expect(line(page, 'tax')).toContainText(egp(e.tax));
      else await expect(line(page, 'tax')).toHaveCount(0);
      await expect(page.getByTestId('customer-total')).toHaveText(egp(e.total));
    });
  }
});

test('sub-agency layer compounds on the agency price; the agency never sees the platform layer', async ({ page }) => {
  // Net 1,000 → platform 6% (hidden from the agency) → agency 12% → Delta Gate 5% → VAT 14%.
  const platform = pct(100_000, 6);
  const agency = pct(100_000 + platform, 12);
  const sub = pct(100_000 + platform + agency, 5);
  const pre = 100_000 + platform + agency + sub;
  const total = pre + pct(pre, 14);
  await signIn(page, ACCOUNTS.agencyOwner);
  await page.goto('/en/agency/pricing');
  await page.getByTestId('tab-simulator').click();
  await simulate(page, { service: 'hotel', ownership: 'network', source: 'extranet', unit: 'room_night', netMinor: 100_000, qty: 1 }, { subAgency: 'Delta Gate Travel' });
  await expect(line(page, 'platform_markup')).toHaveCount(0); // redacted for agencies (TENANCY: no upstream margins)
  await expect(line(page, 'sub_agency_markup')).toContainText(egp(sub));
  await expect(page.getByTestId('customer-total')).toHaveText(egp(total));
});
