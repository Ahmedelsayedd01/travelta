import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateThemeCss, generateTokensCss } from './css';

const files = {
  'tokens.css': generateTokensCss,
  'theme.css': generateThemeCss,
};

describe('generated CSS', () => {
  for (const [name, generate] of Object.entries(files)) {
    it(`${name} is in sync with the TypeScript tokens (run \`pnpm --filter @travelta/design-tokens generate\`)`, () => {
      const path = fileURLToPath(new URL(`../${name}`, import.meta.url));
      const generated = generate();
      if (process.env.UPDATE_TOKENS === '1') writeFileSync(path, generated);
      expect(readFileSync(path, 'utf8')).toBe(generated);
    });
  }
});
