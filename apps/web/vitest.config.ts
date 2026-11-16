import { defineConfig } from 'vitest/config';

/** Unit tests for pure web modules (validation schemas, category rules). Browser behaviour lives in e2e/. */
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
