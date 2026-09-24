import { ApiError } from '@/lib/api';

import { tr } from './tr';

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? tr.errors[err.code] : tr.common.genericError;
}
