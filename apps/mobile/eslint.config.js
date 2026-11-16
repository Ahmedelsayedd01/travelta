// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // Boundaries (MONOREPO_ARCHITECTURE): never the simulated backend directly, never the other app, and
      // @travelta/domain only for presentational rules — the authoritative calculation runs on the server.
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@travelta/domain', allowImportNames: ['validateInstallments', 'contrastBetween', 'subdomainOf', 'canTransition', 'isFollowUpOverdue', 'REQUEST_MOVES'], message: 'Apps use @travelta/domain only for presentational rules.' }],
          patterns: [
            { group: ['@travelta/mock-server', '@travelta/mock-server/*'], message: 'Use @travelta/api-client instead.' },
            { group: ['@travelta/web', '@travelta/web/*'], message: 'Web and mobile never import each other.' },
          ],
        },
      ],
    },
  },
  // Playwright fixtures call `use()` — not a React hook; AxeBuilder is the package's documented default import.
  { files: ['e2e-web/**/*.ts', 'playwright.config.ts'], rules: { 'react-hooks/rules-of-hooks': 'off', 'import/no-named-as-default': 'off' } },
  { ignores: ['dist/*', '.expo/*', 'e2e-web-results/*', 'e2e-web-report/*'] },
]);
