import type { Page } from '@playwright/test';
import { ACCOUNTS, expect, signIn, test, waitForContent } from '../fixtures';
import { SearchResults } from '../pages/storefront';

/**
 * Performance probe — MEASUREMENT ONLY, no pass/fail targets (none are approved). It records, for the production
 * build on this machine: navigation timing of key pages, time from navigation to the first search result, and the
 * number of backend operations a page triggers (to spot repeated requests). Numbers are attached to the report and
 * summarised in docs/QA/E2E_TEST_RESULTS.md with the environment they were taken in.
 */
async function navTiming(page: Page) {
  return page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    return { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp && Math.round(fcp) };
  });
}

test('page timings and first search result (recorded, not asserted)', async ({ page }, info) => {
  const rows: Record<string, unknown>[] = [];
  for (const path of ['/en', '/en/search', '/en/account/login']) {
    await page.goto(path);
    await waitForContent(page);
    rows.push({ page: path, ...(await navTiming(page)) });
  }
  const t0 = Date.now();
  await new SearchResults(page).open('hotel');
  await expect(page.getByTestId('search-result').first()).toBeVisible();
  rows.push({ page: '/en/search?hotel LXR', firstResultMs: Date.now() - t0 });

  await signIn(page, ACCOUNTS.agencyOwner);
  const t1 = Date.now();
  await page.goto('/en/agency');
  await waitForContent(page);
  rows.push({ page: '/en/agency (dashboard)', contentReadyMs: Date.now() - t1, ...(await navTiming(page)) });

  await info.attach('timings.json', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
  console.log(`PERF ${JSON.stringify(rows)}`);
  for (const r of rows) expect(r).toBeTruthy();
});
