import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
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
            { group: ['@travelta/mobile', '@travelta/mobile/*'], message: 'Web and mobile never import each other.' },
          ],
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'e2e-report/**', 'e2e-results/**']),
]);
