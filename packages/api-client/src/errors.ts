import { isApiError, type ApiError, type ErrorCode } from '@travelta/contracts';

/** What every hook/UI receives on failure — the ApiError envelope plus convenience accessors. */
export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly requestId: string;
  readonly details: ApiError['details'];
  /** The session token the failing request carried (lets the app ignore failures of an already-replaced session). */
  requestToken: string | null = null;

  constructor(readonly error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.httpStatus = error.httpStatus;
    this.requestId = error.requestId;
    this.details = error.details;
  }

  /** Field → message key map for forms (VALIDATION_ERROR details). */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).filter((d) => d.field).map((d) => [d.field!, d.issue]));
  }
}

export function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;
  if (error && typeof error === 'object' && 'toApiError' in error && typeof (error as { toApiError: unknown }).toApiError === 'function') {
    return new ApiClientError((error as { toApiError: (id: string) => ApiError }).toApiError('local'));
  }
  if (isApiError(error)) return new ApiClientError(error);
  return new ApiClientError({ code: 'INTERNAL', message: error instanceof Error ? error.message : 'Unexpected error', requestId: 'local', httpStatus: 500 });
}
