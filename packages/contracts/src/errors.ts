/** Stable machine error codes and the HTTP status the future NestJS API will return (DATA_CONTRACTS §4). */
export const ERROR_HTTP_STATUS = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  ORG_NOT_ELIGIBLE: 403,
  PLAN_LIMIT_REACHED: 402,
  INSUFFICIENT_FUNDS: 402,
  PRICE_CHANGED: 409,
  QUOTE_EXPIRED: 410,
  SOLD_OUT: 409,
  SUPPLIER_UNAVAILABLE: 503,
  SUPPLIER_TIMEOUT: 504,
  PAYMENT_DECLINED: 402,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;
export const ERROR_CODES = Object.keys(ERROR_HTTP_STATUS) as ErrorCode[];

export interface ApiErrorDetail {
  field?: string;
  /** i18n key (e.g. `validation.required`) or short machine text. */
  issue: string;
  params?: Record<string, string | number>;
}

export interface ApiError {
  code: ErrorCode;
  /** English fallback; the UI translates `errors.<code>`. */
  message: string;
  details?: ApiErrorDetail[];
  requestId: string;
  httpStatus: number;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' && value !== null &&
    'code' in value && typeof (value as { code: unknown }).code === 'string' &&
    (value as { code: string }).code in ERROR_HTTP_STATUS
  );
}
