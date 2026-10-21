// One place that maps every error code to its HTTP status.
// Developers pass only the code, so the status can never be mistyped.
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  UNAUTHENTICATED: 401,
  PAYMENT_FAILED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATUS: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Validation failed',
  OTP_INVALID: 'The code is not correct',
  OTP_EXPIRED: 'The code has expired',
  UNAUTHENTICATED: 'Please log in to continue',
  PAYMENT_FAILED: 'Payment failed',
  FORBIDDEN: 'You are not allowed to do this',
  NOT_FOUND: 'Not found',
  CONFLICT: 'This conflicts with existing data',
  INVALID_STATUS: 'This action is not allowed in the current status',
  RATE_LIMITED: 'Too many requests, please try again later',
  INTERNAL: 'Something went wrong',
  SERVICE_UNAVAILABLE: 'Service is temporarily unavailable',
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: unknown[];

  constructor(code: ErrorCode, message?: string, details: unknown[] = []) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ERROR_STATUS[code];
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}