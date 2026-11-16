import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build (`pnpm build && pnpm start` on :3001).
 * Every test gets a fresh browser context, so each one starts from freshly seeded demo data (IndexedDB is per context).
 *
 * Browser: the locally installed Google Chrome by default (no download needed). Set PW_CHANNEL= (empty) to use
 * Playwright's bundled Chromium after `pnpm exec playwright install chromium`.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const channel = process.env.PW_CHANNEL === undefined ? 'chrome' : process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL,
    channel,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1280, height: 900 } }, testIgnore: /\.mobile\.spec\.ts$/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel }, testMatch: /\.mobile\.spec\.ts$/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'pnpm build && pnpm start',
    url: `${baseURL}/en`,
    reuseExistingServer: true,
    timeout: 600_000,
  },
});
