import { describe, expect, it } from 'vitest';
import { createRng, hashString } from './random';

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('produces ints within bounds and shuffles without losing items', () => {
    const r = createRng(7);
    for (let i = 0; i < 200; i++) {
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
    expect(r.shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });

  it('hashes strings stably', () => {
    expect(hashString('offer-1')).toBe(hashString('offer-1'));
    expect(hashString('offer-1')).not.toBe(hashString('offer-2'));
  });
});
