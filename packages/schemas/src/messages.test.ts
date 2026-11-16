import { describe, expect, it } from 'vitest';
import { resources } from '@travelta/i18n';
import { msg } from './primitives';

describe('validation messages', () => {
  it('every message key emitted by the schemas is translated in both locales', () => {
    for (const key of Object.values(msg)) {
      const [ns, name] = key.split('.') as ['validation', string];
      expect(ns).toBe('validation');
      for (const locale of ['en', 'ar'] as const) {
        expect((resources[locale].validation as Record<string, string>)[name], `${locale}:${key}`).toBeTruthy();
      }
    }
  });
});
