/** Stable, client-facing error codes. Android and web clients switch on these. */
export const ErrorCodes = {
  VALIDATION_ERROR: 400,
  INVALID_JSON: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  CSRF_REJECTED: 403,
  NOT_FOUND: 404,
  EMERGENCY_NOT_FOUND: 404,
  CONTACT_NOT_FOUND: 404,
  TOKEN_INVALID: 404,
  TOKEN_EXPIRED: 410,
  CONFLICT: 409,
  EMAIL_IN_USE: 409,
  PHONE_IN_USE: 409,
  EMERGENCY_ALREADY_ACTIVE: 409,
  EMERGENCY_NOT_ACTIVE: 409,
  CHECKIN_ALREADY_ACTIVE: 409,
  JOURNEY_ALREADY_ACTIVE: 409,
  CONTACT_LIMIT_REACHED: 409,
  NO_CONTACTS: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  LOCATION_UNAVAILABLE: 422,
  PROVIDER_NOT_CONFIGURED: 501,
  UPSTREAM_UNAVAILABLE: 502,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(code: ErrorCode, message: string, details?: unknown, headers?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = ErrorCodes[code];
    this.details = details;
    this.headers = headers;
  }
}

export interface ApiErrorBody {
  success: false;
  error: { code: ErrorCode; message: string; details?: unknown };
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

export type ApiBody<T> = ApiSuccessBody<T> | ApiErrorBody;
