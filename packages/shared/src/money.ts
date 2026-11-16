/**
 * Money primitives (BUSINESS_RULES MON-1..3).
 * Amounts are integers in minor units; all scaling goes through BigInt so no floating-point error reaches money.
 * Rounding is half-up (half away from zero for negatives).
 */
export const CURRENCY_CODES = ['EGP', 'USD', 'SAR', 'EUR'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface CurrencyMeta {
  code: CurrencyCode;
  exponent: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  EGP: { code: 'EGP', exponent: 2 },
  USD: { code: 'USD', exponent: 2 },
  SAR: { code: 'SAR', exponent: 2 },
  EUR: { code: 'EUR', exponent: 2 },
};

export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Currency mismatch: ${a} vs ${b}`);
  }
}

function assertInt(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${what} must be a safe integer, got ${n}`);
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  assertInt(amountMinor, 'amountMinor');
  return { amountMinor, currency };
}

export const zero = (currency: CurrencyCode): Money => ({ amountMinor: 0, currency });

function same(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  same(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  same(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

export function multiply(m: Money, quantity: number): Money {
  assertInt(quantity, 'quantity');
  return money(m.amountMinor * quantity, m.currency);
}

export const negate = (m: Money): Money => money(-m.amountMinor, m.currency);
export const isZero = (m: Money): boolean => m.amountMinor === 0;
export const isNegative = (m: Money): boolean => m.amountMinor < 0;
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  same(a, b);
  return a.amountMinor === b.amountMinor ? 0 : a.amountMinor < b.amountMinor ? -1 : 1;
}
export const max = (a: Money, b: Money): Money => (compare(a, b) >= 0 ? a : b);
export const min = (a: Money, b: Money): Money => (compare(a, b) <= 0 ? a : b);

/** Integer division of BigInts with half-up (away from zero) rounding. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}

/** Percentages are carried as basis points to keep them integral: 12.5% → 1250 bp. Max 4 decimals of a percent are kept via ×100 scaling below. */
export const PERCENT_SCALE = 1_000_000n; // percent value × 10^4 → 100% = 1,000,000

export function percentToScaled(percent: number): bigint {
  // Round the percent to 4 decimals before scaling (e.g. 12.5 → 125000).
  return BigInt(Math.round(percent * 10_000));
}

/** amount × percent / 100, half-up. `percent` is a plain number such as 8 or 12.5. */
export function percentOf(m: Money, percent: number): Money {
  const scaled = percentToScaled(percent);
  return money(Number(divRoundHalfUp(BigInt(m.amountMinor) * scaled, PERCENT_SCALE)), m.currency);
}

/** Exchange rates are carried as integers scaled by 1e8 (rate 48.5 → 4_850_000_000n). */
export const RATE_SCALE = 100_000_000n;

export function rateToScaled(rate: number): bigint {
  if (!(rate > 0)) throw new RangeError(`Exchange rate must be positive, got ${rate}`);
  return BigInt(Math.round(rate * 1e8));
}

/** Convert `m` into `to` using `rate` (units of `to` per 1 unit of `m.currency`), half-up. */
export function convert(m: Money, to: CurrencyCode, rate: number): Money {
  if (m.currency === to) return m;
  const expDiff = CURRENCIES[to].exponent - CURRENCIES[m.currency].exponent;
  let num = BigInt(m.amountMinor) * rateToScaled(rate);
  let den = RATE_SCALE;
  if (expDiff > 0) num *= 10n ** BigInt(expDiff);
  if (expDiff < 0) den *= 10n ** BigInt(-expDiff);
  return money(Number(divRoundHalfUp(num, den)), to);
}

/**
 * Split `m` across `weights` so the parts always sum exactly to `m` (largest-remainder method).
 * Used for instalments, payment allocations and pro-rata refunds.
 */
export function allocate(m: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) throw new RangeError('allocate needs at least one weight');
  if (weights.some((w) => !(w >= 0))) throw new RangeError('weights must be non-negative');
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) throw new RangeError('weights must not all be zero');
  const sign = m.amountMinor < 0 ? -1 : 1;
  const abs = Math.abs(m.amountMinor);
  const raw = weights.map((w) => (abs * w) / total);
  const floors = raw.map(Math.floor);
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    remainder--;
  }
  return floors.map((f) => money(sign * f, m.currency));
}

/** Parse a major-unit decimal string/number ("1,250.50", 99.9) into minor units, half-up. */
export function toMinor(major: string | number, currency: CurrencyCode): number {
  const text = typeof major === 'number' ? major.toString() : major.replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new RangeError(`Invalid amount "${major}"`);
  const exp = CURRENCIES[currency].exponent;
  const [intPart = '0', fracPart = ''] = text.replace('-', '').split('.');
  const padded = (fracPart + '0'.repeat(exp + 1)).slice(0, exp + 1);
  const units = BigInt(intPart) * 10n ** BigInt(exp + 1) + BigInt(padded);
  const rounded = divRoundHalfUp(units, 10n);
  return Number(text.startsWith('-') ? -rounded : rounded);
}

export function toMajor(m: Money): number {
  return m.amountMinor / 10 ** CURRENCIES[m.currency].exponent;
}

export function formatMoney(m: Money, locale: string = 'en', options: { compact?: boolean } = {}): string {
  const exp = CURRENCIES[m.currency].exponent;
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: options.compact ? 0 : exp,
    maximumFractionDigits: exp,
    notation: options.compact ? 'compact' : 'standard',
  }).format(toMajor(m));
}
