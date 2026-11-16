import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_CODES } from '@travelta/contracts';
import { NOTIFICATION_TOPICS, operations } from '@travelta/schemas';
import { describe, expect, it } from 'vitest';
import { handlers } from './server';

/**
 * M24 cross-app contract tests: the operation catalogue (DATA_CONTRACTS §6) is the single contract between the apps,
 * the simulated server and the future NestJS API. These tests keep the three in lock-step.
 */
const ROOT = join(import.meta.dirname, '../../..');
const files = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.') || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};
const source = (dirs: string[]) => dirs.flatMap((d) => files(join(ROOT, d)).map((f) => ({ f, s: readFileSync(f, 'utf8') })));
const en = JSON.parse(readFileSync(join(ROOT, 'packages/i18n/src/locales/en.json'), 'utf8')) as Record<string, Record<string, unknown>>;
const ar = JSON.parse(readFileSync(join(ROOT, 'packages/i18n/src/locales/ar.json'), 'utf8')) as Record<string, Record<string, unknown>>;
const has = (d: Record<string, unknown>, key: string) => key.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), d) !== undefined;

describe('operation catalogue ⇄ server', () => {
  it('every operation has exactly one handler and every handler is in the catalogue', () => {
    expect(Object.keys(handlers).sort()).toEqual(Object.keys(operations).sort());
  });

  it('every HTTP route (method + path) is unique, so the future API can implement the catalogue 1:1', () => {
    const routes = Object.entries(operations).map(([name, op]) => `${op.http.method} ${op.http.path} ← ${name}`);
    const keys = routes.map((r) => r.split(' ← ')[0]);
    const dupes = routes.filter((r, i) => keys.indexOf(r.split(' ← ')[0]!) !== i);
    expect(dupes).toEqual([]);
  });

  it('public operations are only sign-in, registration, password recovery, reference data (incl. map places), search and storefront branding', () => {
    const pub = Object.entries(operations).filter(([, op]) => op.auth === 'public' && !op.demoOnly).map(([n]) => n);
    expect(pub.every((n) => /^(auth\.(login|registerCustomer|requestPasswordReset|resetPassword)|onboarding\.registerBusiness|reference\.|fx\.|search\.|storefront\.public$|places\.(list|hotelLocation)$)/.test(n))).toBe(true);
  });
});

describe('apps ⇄ catalogue', () => {
  const apps = source(['apps/web/src', 'apps/mobile/src']);
  const calls = apps.flatMap(({ f, s }) => [...s.matchAll(/api\.call\(\s*'([a-zA-Z.]+)'/g)].map((m) => ({ f, op: m[1]! })));

  it('every operation the web and mobile apps call exists in the catalogue', () => {
    expect(calls.length).toBeGreaterThan(100);
    expect(calls.filter((c) => !(c.op in operations)).map((c) => `${c.op} (${c.f})`)).toEqual([]);
  });

  it('demo-only operations are called only from demo tooling and sign-in helpers', () => {
    const misuse = calls.filter((c) => (operations as Record<string, { demoOnly?: boolean }>)[c.op]?.demoOnly && !/\/(demo|auth)\//.test(c.f));
    expect(misuse.map((c) => `${c.op} (${c.f})`)).toEqual([]);
  });

  it('apps never import the simulated server or each other', () => {
    const bad = apps.filter(({ f, s }) => /from '@travelta\/mock-server/.test(s) || (f.includes('apps/web') && /from '@travelta\/mobile/.test(s)) || (f.includes('apps/mobile') && /from '@travelta\/web/.test(s)));
    expect(bad.map((x) => x.f)).toEqual([]);
  });
});

describe('server messages ⇄ i18n', () => {
  const server = source(['packages/mock-server/src', 'packages/schemas/src', 'packages/domain/src']);

  it('every error code has a translation in both languages', () => {
    for (const code of ERROR_CODES) {
      expect(has(en, `errors.${code}`), `en errors.${code}`).toBe(true);
      expect(has(ar, `errors.${code}`), `ar errors.${code}`).toBe(true);
    }
  });

  it('every notification topic has a label in both languages', () => {
    const missing = NOTIFICATION_TOPICS.map((t) => `notifications.topic_${t.replace('.', '_')}`).filter((k) => !has(en, k) || !has(ar, k));
    expect(missing).toEqual([]);
  });

  it('every validation/error issue key the server or schemas can emit is translated in both languages', () => {
    const keys = new Set(server.flatMap(({ s }) => [...s.matchAll(/'((?:validation|errors)\.[a-zA-Z_]+)'/g)].map((m) => m[1]!)));
    expect(keys.size).toBeGreaterThan(40);
    const missing = [...keys].filter((k) => !has(en, k) || !has(ar, k));
    expect(missing).toEqual([]);
  });
});

describe('travel photo catalogue ⇄ app assets', () => {
  it('every catalogue key has its web hero, web card and mobile file', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { TRAVEL_IMAGE_KEYS } = await import('@travelta/shared');
    const root = join(import.meta.dirname, '../../..');
    const missing = TRAVEL_IMAGE_KEYS.flatMap((k) => [
      `apps/web/public/images/travel/${k}.jpg`, `apps/web/public/images/travel/card/${k}.jpg`, `apps/mobile/assets/travel/${k}.jpg`,
    ]).filter((f) => !existsSync(join(root, f)));
    expect(TRAVEL_IMAGE_KEYS.length).toBe(40);
    expect(missing).toEqual([]);
  });
});
