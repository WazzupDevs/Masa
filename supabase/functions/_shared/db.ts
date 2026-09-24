import { AppError, isDomainErrorCode } from './pure/errors.ts';

// Database errors: domain codes raised by our SQL functions (errcode P0001) become AppErrors;
// anything else is rethrown with its code only, so no request value reaches the logs.
export function dbError(step: string, error: { code: string; message: string }): Error {
  if (error.code === 'P0001' && isDomainErrorCode(error.message)) {
    return new AppError(error.message, error.message);
  }
  return new Error(`${step} failed (${error.code})`);
}
