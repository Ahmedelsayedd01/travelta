import { describe, expect, it } from 'vitest';
import { createId } from '@travelta/shared';
import {
  emailSchema, idSchema, isoDateSchema, listQuerySchema, moneySchema, msg, passwordSchema, phoneSchema, positiveMoneySchema,
} from './primitives';
import { bookingItemStatusSchema, serviceTypeSchema } from './enums';

const firstIssue = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe('primitive schemas', () => {
  it('normalises and validates emails', () => {
    expect(emailSchema.parse('  Owner@NileHorizon.demo ')).toBe('owner@nilehorizon.demo');
    expect(firstIssue(emailSchema.safeParse('nope'))).toBe(msg.invalidEmail);
  });

  it('validates phones in international format', () => {
    expect(phoneSchema.parse('+20 100-123-4567')).toBe('+201001234567');
    expect(firstIssue(phoneSchema.safeParse('12'))).toBe(msg.invalidPhone);
  });

  it('enforces password strength', () => {
    expect(passwordSchema.safeParse('Demo@1234').success).toBe(true);
    expect(firstIssue(passwordSchema.safeParse('alllowercase1'))).toBe(msg.weakPassword);
  });

  it('accepts only real calendar dates', () => {
    expect(isoDateSchema.safeParse('2026-11-15').success).toBe(true);
    expect(firstIssue(isoDateSchema.safeParse('2026-02-30'))).toBe(msg.invalidDate);
  });

  it('requires integer minor units and supported currencies', () => {
    expect(moneySchema.safeParse({ amountMinor: 100, currency: 'EGP' }).success).toBe(true);
    expect(moneySchema.safeParse({ amountMinor: 1.5, currency: 'EGP' }).success).toBe(false);
    expect(moneySchema.safeParse({ amountMinor: 1, currency: 'GBP' }).success).toBe(false);
    expect(firstIssue(positiveMoneySchema.safeParse({ amountMinor: 0, currency: 'EGP' }))).toBe(msg.mustBePositive);
  });

  it('checks prefixed ids', () => {
    const schema = idSchema('bk');
    expect(schema.safeParse(createId('bk')).success).toBe(true);
    expect(schema.safeParse(createId('inv')).success).toBe(false);
  });

  it('defaults and bounds list queries', () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(listQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
    expect(listQuerySchema.safeParse({ sort: 'createdAt:desc' }).success).toBe(true);
  });
});

describe('enum schemas', () => {
  it('covers all seven services and rejects free text statuses', () => {
    expect(serviceTypeSchema.options).toHaveLength(7);
    expect(bookingItemStatusSchema.safeParse('reqhotel').success).toBe(false);
  });
});
