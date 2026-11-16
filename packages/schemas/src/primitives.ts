import { z } from 'zod';
import { CURRENCY_CODES, isISODate } from '@travelta/shared';
import { DEFAULT_PAGE_SIZE, LOCALES, MAX_PAGE_SIZE } from '@travelta/contracts';

/**
 * Validation messages are i18n keys (namespace `validation`) so web and mobile translate them the same way.
 * Params for interpolation are attached through Zod's `params` where needed.
 */
export const msg = {
  required: 'validation.required',
  invalidEmail: 'validation.invalid_email',
  invalidPhone: 'validation.invalid_phone',
  invalidDate: 'validation.invalid_date',
  tooShort: 'validation.too_short',
  tooLong: 'validation.too_long',
  mustBePositive: 'validation.must_be_positive',
  mustBeInteger: 'validation.must_be_integer',
  weakPassword: 'validation.weak_password',
  invalidId: 'validation.invalid_id',
  invalidValue: 'validation.invalid_value',
} as const;

export const currencySchema = z.enum(CURRENCY_CODES, { error: msg.invalidValue });
export const localeSchema = z.enum(LOCALES, { error: msg.invalidValue });

export const isoDateSchema = z.string({ error: msg.required }).refine(isISODate, { error: msg.invalidDate });
export const isoDateTimeSchema = z.iso.datetime({ error: msg.invalidDate });

export const minorAmountSchema = z.number({ error: msg.required }).int({ error: msg.mustBeInteger });
export const moneySchema = z.object({ amountMinor: minorAmountSchema, currency: currencySchema });
export const positiveMoneySchema = moneySchema.refine((m) => m.amountMinor > 0, { error: msg.mustBePositive, path: ['amountMinor'] });

export const idSchema = <P extends string>(prefix: P) =>
  z.string().regex(new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`), { error: msg.invalidId }) as unknown as z.ZodType<`${P}_${string}`>;

export const requiredText = (max = 200) =>
  z.string({ error: msg.required }).trim().min(1, { error: msg.required }).max(max, { error: msg.tooLong });

export const localizedTextSchema = z.object({ en: requiredText(), ar: requiredText() });

/** WGS84 coordinates (maps). Null island (0,0) is rejected — it is almost always a missing value. */
export const geoPointSchema = z.object({
  lat: z.number({ error: msg.required }).min(-90, { error: 'validation.latitude' }).max(90, { error: 'validation.latitude' }),
  lng: z.number({ error: msg.required }).min(-180, { error: 'validation.longitude' }).max(180, { error: 'validation.longitude' }),
}).refine((g) => !(g.lat === 0 && g.lng === 0), { error: 'validation.latitude', path: ['lat'] });

export const emailSchema = z.string({ error: msg.required }).trim().toLowerCase().pipe(z.email({ error: msg.invalidEmail }));

/** International format: optional +, 8–15 digits, spaces/dashes allowed while typing. */
export const phoneSchema = z
  .string({ error: msg.required })
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\+?[1-9]\d{7,14}$/, { error: msg.invalidPhone }));

/** ≥ 8 chars with upper, lower and a digit. */
export const passwordSchema = z
  .string({ error: msg.required })
  .min(8, { error: msg.tooShort })
  .max(128, { error: msg.tooLong })
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), { error: msg.weakPassword });

export const percentSchema = z.number({ error: msg.required }).min(0, { error: msg.mustBePositive }).max(1000, { error: msg.invalidValue });

export const listQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z
    .custom<`${string}:${'asc' | 'desc'}`>((v) => typeof v === 'string' && /^[a-zA-Z0-9_.]+:(asc|desc)$/.test(v), { error: msg.invalidValue })
    .optional(),
  q: z.string().trim().max(200).optional(),
  filters: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});
