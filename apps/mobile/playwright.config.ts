import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests of the mobile app rendered by Expo Web (react-native-web), at phone size.
 * They exercise the shared screens and logic in a real browser; they do NOT replace iOS/Android device testing.
 * Run `pnpm --filter @travelta/mobile export:web` first (or let the webServer below build it).
 */
const channel = process.env.PW_CHANNEL === undefined ? 'chrome' : process.env.PW_CHANNEL || undefined;
export default defineConfig({
  testDir: './e2e-web',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 3,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-web-report' }]],
  outputDir: 'e2e-web-results',
  use: { baseURL: 'http://localhost:8090', channel, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'], channel } }],
  webServer: {
    command: process.env.EXPO_WEB_SKIP_EXPORT ? 'node scripts/serve-web.mjs dist/web 8090' : 'pnpm export:web && node scripts/serve-web.mjs dist/web 8090',
    url: 'http://localhost:8090',
    reuseExistingServer: true,
    timeout: 600_000,
  },
});
