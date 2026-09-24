export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'consent_outdated'
  | 'onboarding_required'
  | 'venue_not_found'
  | 'too_far'
  | 'alias_exhausted'
  | 'no_active_table'
  | 'already_in_room'
  | 'room_not_available'
  | 'request_pending'
  | 'rate_limited'
  | 'request_expired'
  | 'request_not_found'
  | 'method_not_allowed'
  | 'internal';

export type ApiErrorBody = { error: { code: ErrorCode; message: string } };

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function toErrorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

// Codes the database functions raise (errcode P0001, message = code). Anything else is internal.
export const DOMAIN_ERROR_CODES: readonly ErrorCode[] = [
  'no_active_table',
  'already_in_room',
  'room_not_available',
  'request_pending',
  'rate_limited',
  'request_expired',
  'request_not_found',
];

export function isDomainErrorCode(value: string): value is ErrorCode {
  return (DOMAIN_ERROR_CODES as readonly string[]).includes(value);
}
