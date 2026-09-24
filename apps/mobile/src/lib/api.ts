import { FunctionsHttpError } from '@supabase/supabase-js';
import type { AccountRequest, AccountResponse } from '@shared/api/account.ts';
import type { ChatResponse, SafetyResponse } from '@shared/api/chat.ts';
import type { RevealResponse } from '@shared/api/reveal.ts';
import type {
  GameOkResponse,
  TabuCardResponse,
  TabuGuessResponse,
  TabuStartResponse,
} from '@shared/api/games.ts';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  RequestJoinResponse,
  RoomsOkResponse,
} from '@shared/api/rooms.ts';
import type { CheckInRequest, CheckInResponse, LeaveResponse } from '@shared/api/checkin.ts';
import type { ReportReason } from '@shared/chat.ts';
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

export const chatApi = {
  send: (roomId: string, body: string) =>
    invoke<ChatResponse>('chat', { action: 'send', roomId, body }),
};

export const safetyApi = {
  report: (roomId: string, reason: ReportReason) =>
    invoke<SafetyResponse>('safety', { action: 'report', roomId, reason }),
  block: (roomId: string) => invoke<SafetyResponse>('safety', { action: 'block', roomId }),
  unblock: (blockId: string) => invoke<SafetyResponse>('safety', { action: 'unblock', blockId }),
};

export const gamesApi = {
  tabuStart: (roomId: string) => invoke<TabuStartResponse>('tabu', { action: 'start', roomId }),
  tabuCard: (roomId: string) =>
    invoke<TabuCardResponse>('tabu', { action: 'current-card', roomId }),
  tabuClue: (roomId: string, text: string) =>
    invoke<GameOkResponse>('tabu', { action: 'clue', roomId, text }),
  tabuGuess: (roomId: string, text: string) =>
    invoke<TabuGuessResponse>('tabu', { action: 'guess', roomId, text }),
  tabuPass: (roomId: string) => invoke<GameOkResponse>('tabu', { action: 'pass', roomId }),
  tabuEndTurn: (roomId: string) => invoke<GameOkResponse>('tabu', { action: 'end-turn', roomId }),
  sohbetNext: (roomId: string) => invoke<GameOkResponse>('sohbet', { action: 'next-card', roomId }),
};

export const revealApi = {
  decide: (roomId: string, wantsMeet: boolean) =>
    invoke<RevealResponse>('reveal', { action: 'decide', roomId, wantsMeet }),
  finalize: (roomId: string) => invoke<RevealResponse>('reveal', { action: 'finalize', roomId }),
};
