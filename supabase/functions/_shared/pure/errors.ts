export type ErrorCode =
  'bad_request' | 'unauthorized' | 'consent_outdated' | 'method_not_allowed' | 'internal';

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
