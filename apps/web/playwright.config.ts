import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build (`pnpm build && pnpm start` on :3001).
 * Every test gets a fresh browser context, so each one starts from freshly seeded demo data (IndexedDB is per context).
 *
 * Browser: the locally installed Google Chrome by default (no download needed). Set PW_CHANNEL= (empty) to use
 * Playwright's bundled Chromium after `pnpm exec playwright install chromium`.
 *
 * Projects (see docs/QA/PLAYWRIGHT_TEST_STRATEGY.md):
 *  - desktop            1440×900 Chrome: every functional, role, lifecycle, finance, security and a11y suite.
 *  - mobile             Pixel 7: the *.mobile.spec.ts journeys (touch).
 *  - device matrix      responsive/*.matrix.spec.ts at 1920×1080, 1024×768, 768×1024, 430×932, 390×844, 375×812
 *                       (desktop 1440 runs it too through the desktop project).
 *  - firefox / webkit   tests tagged @smoke or @xbrowser, where those browsers are installed
 *                       (`pnpm --filter @travelta/web exec playwright install firefox webkit`).
 *  - service            security/*.service.spec.ts: calls the mock server directly in Node (no browser).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const channel = process.env.PW_CHANNEL === undefined ? 'chrome' : process.env.PW_CHANNEL || undefined;
const MOBILE = /\.mobile\.spec\.ts$/;
const MATRIX = /\.matrix\.spec\.ts$/;
const SERVICE = /\.service\.spec\.ts$/;

const viewport = (name: string, width: number, height: number, touch: boolean) => ({
  name,
  testMatch: MATRIX,
  use: touch
    ? { ...devices['Pixel 7'], channel, viewport: { width, height }, deviceScaleFactor: 2 }
    : { ...devices['Desktop Chrome'], channel, viewport: { width, height } },
});

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }], ['json', { outputFile: 'e2e-report/results.json' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL,
    // `channel` (local Chrome) is set per Chromium project: Firefox and WebKit must not inherit it.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } }, testIgnore: [MOBILE, SERVICE] },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel }, testMatch: MOBILE },
    viewport('desktop-1920', 1920, 1080, false),
    viewport('tablet-landscape', 1024, 768, true),
    viewport('tablet-portrait', 768, 1024, true),
    viewport('mobile-430', 430, 932, true),
    viewport('mobile-390', 390, 844, true),
    viewport('mobile-375', 375, 812, true),
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } }, grep: /@smoke|@xbrowser/, testIgnore: [MOBILE, SERVICE, MATRIX] },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }, grep: /@smoke|@xbrowser/, testIgnore: [MOBILE, SERVICE, MATRIX] },
    { name: 'service', testMatch: SERVICE, use: { channel } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'pnpm build && pnpm start',
    url: `${baseURL}/en`,
    reuseExistingServer: true,
    timeout: 600_000,
  },
});
