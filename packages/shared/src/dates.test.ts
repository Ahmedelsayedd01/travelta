import { describe, expect, it } from 'vitest';
import { addDays, diffDays, eachDate, isISODate, nightsBetween } from './dates';

describe('dates', () => {
  it('validates ISO dates strictly', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-2-3')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts nights and enumerates stay dates', () => {
    expect(nightsBetween('2026-11-15', '2026-11-18')).toBe(3);
    expect(diffDays('2026-11-18', '2026-11-15')).toBe(-3);
    expect(eachDate('2026-11-15', '2026-11-18')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
  });
});
