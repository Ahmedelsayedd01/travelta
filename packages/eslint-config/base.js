// Shared lint rules for framework-agnostic packages (contracts, schemas, domain, mock-server, …).
// Apps extend their framework config (eslint-config-next / eslint-config-expo) and add the
// boundary rules below, so business logic cannot leak into UI code and vice versa.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Packages that must stay free of UI frameworks. */
export const frameworkFreeRestrictions = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['react', 'react-dom', 'react-native', 'next', 'next/*', 'expo', 'expo-*'], message: 'Shared packages must not depend on UI frameworks.' },
      ],
    },
  ],
};

const UI = { group: ['react', 'react-dom', 'react-native', 'next', 'next/*', 'expo', 'expo-*'], message: 'Shared packages must not depend on UI frameworks.' };
const APPS = { group: ['@travelta/web', '@travelta/web/*', '@travelta/mobile', '@travelta/mobile/*'], message: 'Packages never depend on apps.' };
const BACKEND = { group: ['@travelta/mock-server', '@travelta/mock-server/*', '@travelta/api-client', '@travelta/api-client/*'], message: 'Business rules and contracts stay transport- and storage-free (MONOREPO_ARCHITECTURE §dependency rules).' };

/** contracts, schemas, domain, shared, i18n, design-tokens: no UI, no backend/transport, no apps. */
export const pureRestrictions = { 'no-restricted-imports': ['error', { patterns: [UI, APPS, BACKEND] }] };
/** mock-server: no UI, no apps, and never the api-client (the client depends on the server, not the reverse). */
export const serverRestrictions = { 'no-restricted-imports': ['error', { patterns: [UI, APPS, { group: ['@travelta/api-client', '@travelta/api-client/*'], message: 'The server never depends on its client.' }] }] };
/** api-client: no UI and no apps. */
export const clientRestrictions = { 'no-restricted-imports': ['error', { patterns: [UI, APPS] }] };

/**
 * Apps: never the simulated backend directly (only through @travelta/api-client), never the other app, and domain only
 * for presentational rules — the authoritative calculation runs on the server.
 */
export const appBoundaries = (otherApp) => ({
  'no-restricted-imports': ['error', {
    paths: [{ name: '@travelta/domain', allowImportNames: ['validateInstallments', 'contrastBetween', 'subdomainOf', 'canTransition', 'isFollowUpOverdue', 'REQUEST_MOVES'], message: 'Apps use @travelta/domain only for presentational rules; ask the API for authoritative results.' }],
    patterns: [
      { group: ['@travelta/mock-server', '@travelta/mock-server/*'], message: 'Use @travelta/api-client instead.' },
      { group: [otherApp, `${otherApp}/*`], message: 'Web and mobile never import each other.' },
    ],
  }],
});

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', '.turbo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
