import { describe, expect, it } from 'vitest';
import { createId, idPrefix } from './ids';

describe('createId', () => {
  it('prefixes and produces 26 body chars', () => {
    const id = createId('bk', 1_700_000_000_000, () => 0.5);
    expect(id.startsWith('bk_')).toBe(true);
    expect(id.length).toBe(3 + 26);
    expect(idPrefix(id)).toBe('bk');
  });

  it('sorts by time', () => {
    const a = createId('bk', 1_000, () => 0.9);
    const b = createId('bk', 2_000, () => 0.1);
    expect(a < b).toBe(true);
  });
});
