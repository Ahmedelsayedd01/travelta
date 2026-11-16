import { ERROR_HTTP_STATUS, type ApiError, type ApiErrorDetail, type ErrorCode } from '@travelta/contracts';

/** Thrown by services; converted to the ApiError envelope at the server boundary. */
export class ApiException extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiException';
  }

  toApiError(requestId: string): ApiError {
    return { code: this.code, message: this.message, details: this.details, requestId, httpStatus: ERROR_HTTP_STATUS[this.code] };
  }
}

export const notFound = (what: string) => new ApiException('NOT_FOUND', `${what} not found`);
export const forbidden = (why = 'Missing permission') => new ApiException('FORBIDDEN', why);
export const invalid = (details: ApiErrorDetail[], message = 'Validation failed') => new ApiException('VALIDATION_ERROR', message, details);
