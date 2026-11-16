import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError, add, allocate, convert, divRoundHalfUp, formatMoney, money, multiply,
  percentOf, subtract, sum, toMinor,
} from './money';

const egp = (n: number) => money(n, 'EGP');

describe('money arithmetic', () => {
  it('adds and subtracts same-currency amounts', () => {
    expect(add(egp(100), egp(250))).toEqual(egp(350));
    expect(subtract(egp(100), egp(250))).toEqual(egp(-150));
    expect(sum([egp(1), egp(2), egp(3)], 'EGP')).toEqual(egp(6));
  });

  it('refuses mixed currencies', () => {
    expect(() => add(egp(1), money(1, 'USD'))).toThrow(CurrencyMismatchError);
  });

  it('rejects non-integer minor units', () => {
    expect(() => money(1.5, 'EGP')).toThrow(RangeError);
  });

  it('v1 tax example: 2×110 @5% + 5×125 @0% = 856 EGP (PRC-7)', () => {
    const deluxe = multiply(egp(11_000), 2);
    const standard = multiply(egp(12_500), 5);
    const total = add(add(deluxe, percentOf(deluxe, 5)), add(standard, percentOf(standard, 0)));
    expect(total).toEqual(egp(85_600));
  });
});

describe('rounding (MON-2)', () => {
  it('rounds half up, away from zero for negatives', () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfUp(4n, 3n)).toBe(1n);
  });

  it('computes percentages without float error', () => {
    expect(percentOf(egp(105), 10)).toEqual(egp(11)); // 10.5 → 11
    expect(percentOf(money(118_800, 'USD'), 14)).toEqual(money(16_632, 'USD'));
    expect(percentOf(egp(1), 12.5)).toEqual(egp(0));
    expect(percentOf(egp(33_333), 33.3333)).toEqual(egp(11_111));
  });
});

describe('FX conversion', () => {
  it('converts with half-up rounding', () => {
    expect(convert(money(100_00, 'USD'), 'EGP', 48.5)).toEqual(egp(4_850_00));
    expect(convert(money(1, 'USD'), 'EGP', 48.555)).toEqual(egp(49)); // 0.48555 EGP → 0.49
  });

  it('is identity for same currency', () => {
    expect(convert(egp(123), 'EGP', 99)).toEqual(egp(123));
  });
});

describe('allocate', () => {
  it('splits exactly with no lost cents', () => {
    const parts = allocate(egp(100), [1, 1, 1]);
    expect(parts.map((p) => p.amountMinor)).toEqual([34, 33, 33]);
    expect(sum(parts, 'EGP')).toEqual(egp(100));
  });

  it('handles negative amounts', () => {
    expect(sum(allocate(egp(-101), [2, 1]), 'EGP')).toEqual(egp(-101));
  });

  it('respects weights: 770 = 70 + 600 + 100 (PAY-2)', () => {
    expect(allocate(egp(77_000), [70, 600, 100]).map((p) => p.amountMinor)).toEqual([7_000, 60_000, 10_000]);
  });
});

describe('parsing & formatting', () => {
  it('parses major units', () => {
    expect(toMinor('1,250.50', 'EGP')).toBe(125_050);
    expect(toMinor('0.005', 'USD')).toBe(1);
    expect(toMinor(-12.345, 'USD')).toBe(-1235);
    expect(() => toMinor('abc', 'USD')).toThrow(RangeError);
  });

  it('formats per locale with western digits', () => {
    expect(formatMoney(money(137_712, 'USD'), 'en')).toBe('$1,377.12');
    expect(formatMoney(egp(85_600), 'ar')).toMatch(/856\.00/);
  });
});
