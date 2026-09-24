import { FunctionsHttpError } from '@supabase/supabase-js';
import type { AccountRequest, AccountResponse } from '@shared/api/account.ts';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  RequestJoinResponse,
  RoomsOkResponse,
} from '@shared/api/rooms.ts';
import type { CheckInRequest, CheckInResponse, LeaveResponse } from '@shared/api/checkin.ts';
import { type ErrorCode, isApiErrorBody } from '@shared/errors.ts';

import { supabase } from './supabase';

export class ApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, { body });
  if (error instanceof FunctionsHttpError) {
    const payload: unknown = await error.context.json().catch(() => null);
    if (isApiErrorBody(payload)) throw new ApiError(payload.error.code, payload.error.message);
    throw new ApiError('internal', error.message);
  }
  if (error || data === null) throw new ApiError('internal', error?.message ?? 'Empty response');
  return data;
}

export function callAccount(body: AccountRequest): Promise<AccountResponse> {
  return invoke<AccountResponse>('account', body);
}

export function callCheckIn(body: CheckInRequest): Promise<CheckInResponse> {
  return invoke<CheckInResponse>('checkin', body);
}

export function callLeave(): Promise<LeaveResponse> {
  return invoke<LeaveResponse>('checkin', { action: 'leave' });
}

export const roomsApi = {
  create: (body: Omit<CreateRoomRequest, 'action'>) =>
    invoke<CreateRoomResponse>('rooms', { action: 'create', ...body }),
  requestJoin: (roomId: string) =>
    invoke<RequestJoinResponse>('rooms', { action: 'request-join', roomId }),
  respond: (requestId: string, accept: boolean) =>
    invoke<RoomsOkResponse>('rooms', { action: 'respond', requestId, accept }),
  leave: () => invoke<RoomsOkResponse>('rooms', { action: 'leave' }),
  end: () => invoke<RoomsOkResponse>('rooms', { action: 'end' }),
};
