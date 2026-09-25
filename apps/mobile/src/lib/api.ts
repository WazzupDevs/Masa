import { FunctionsHttpError } from '@supabase/supabase-js';
import type { AccountRequest, AccountResponse } from '@shared/api/account.ts';
import type { ChatResponse, SafetyResponse } from '@shared/api/chat.ts';
import type { RevealResponse } from '@shared/api/reveal.ts';
import type {
  GameOkResponse,
  TabuStartResponse,
  TabuTurnCardsResponse,
} from '@shared/api/games.ts';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  RequestJoinResponse,
  RoomsOkResponse,
} from '@shared/api/rooms.ts';
import type { CheckInRequest, CheckInResponse, LeaveResponse } from '@shared/api/checkin.ts';
import type { DmOkResponse, FriendsListResponse, FriendsOkResponse } from '@shared/api/friends.ts';
import type { ProfileRequest, ProfileUploadUrl, ProfileView } from '@shared/api/profile.ts';
import type { ReportReason } from '@shared/chat.ts';
import type { Mark } from '@shared/tabu.ts';
import { callName, RETRY_DELAY_MS, retriesAfter } from '@shared/apiRetry.ts';
import { type ErrorCode, isApiErrorBody } from '@shared/errors.ts';

import { useUpdateGate } from '@/features/update/updateGate';

import { appBuildHeaders } from './appBuild';
import { reportFunctionFailure } from './errorReporting';
import { supabase } from './supabase';

export class ApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

// Every Edge Function call goes through here: it carries the native build number, and an
// update_required answer switches the whole app to the "Güncelleme gerekli" screen. A 5xx is
// reported (function and status only) and, for the calls in IDEMPOTENT_CALLS, sent once more after
// a short wait.
async function invoke<T>(fn: string, body: Record<string, unknown>, attempt = 1): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, {
    body,
    headers: appBuildHeaders,
  });
  if (error instanceof FunctionsHttpError) {
    const status = (error.context as Response).status;
    if (status >= 500) {
      const call = callName(fn, body);
      reportFunctionFailure(call, status);
      if (retriesAfter(call, status, attempt)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return invoke<T>(fn, body, attempt + 1);
      }
    }
    const payload: unknown = await error.context.json().catch(() => null);
    if (isApiErrorBody(payload)) {
      if (payload.error.code === 'update_required') useUpdateGate.getState().markRequired();
      throw new ApiError(payload.error.code, payload.error.message);
    }
    throw new ApiError('internal', error.message);
  }
  if (error || data === null) throw new ApiError('internal', error?.message ?? 'Empty response');
  return data;
}

// Update gate check on launch and foreground (the ping function does nothing else). Failures other
// than update_required are ignored: the next real call will show them.
export function pingUpdateGate(): Promise<void> {
  return invoke<{ ok: true }>('ping', {}).then(
    () => undefined,
    () => undefined,
  );
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
  reportProfile: (publicId: string, reason: ReportReason) =>
    invoke<SafetyResponse>('safety', { action: 'report', target: 'profile', publicId, reason }),
  reportHistory: (historyId: string, reason: ReportReason) =>
    invoke<SafetyResponse>('safety', { action: 'report', target: 'history', historyId, reason }),
  reportDm: (threadId: string, reason: ReportReason) =>
    invoke<SafetyResponse>('safety', { action: 'report', target: 'dm', threadId, reason }),
  blockFriend: (publicId: string, report?: ReportReason) =>
    invoke<SafetyResponse>('safety', { action: 'block', publicId, ...(report ? { report } : {}) }),
  blockHistory: (historyId: string, report?: ReportReason) =>
    invoke<SafetyResponse>('safety', { action: 'block', historyId, ...(report ? { report } : {}) }),
  block: (roomId: string) => invoke<SafetyResponse>('safety', { action: 'block', roomId }),
  unblock: (blockId: string) => invoke<SafetyResponse>('safety', { action: 'unblock', blockId }),
};

export const gamesApi = {
  // Two-table rooms start the voice game (docs/SPEC_V2.md §8.2); one-table rooms get the deck.
  // One-table rooms get the deck; two-table rooms start the face-to-face game.
  tabuStart: (roomId: string) => invoke<TabuStartResponse>('tabu', { action: 'start', roomId }),
  tabuTurnCards: (roomId: string) =>
    invoke<TabuTurnCardsResponse>('tabu', { action: 'turn-cards', roomId }),
  tabuMark: (roomId: string, mark: Mark) =>
    invoke<GameOkResponse>('tabu', { action: 'mark', roomId, ...mark }),
  tabuEndTurn: (roomId: string) => invoke<GameOkResponse>('tabu', { action: 'end-turn', roomId }),
  sohbetNext: (roomId: string) => invoke<GameOkResponse>('sohbet', { action: 'next-card', roomId }),
};

export const revealApi = {
  decide: (roomId: string, wantsMeet: boolean) =>
    invoke<RevealResponse>('reveal', { action: 'decide', roomId, wantsMeet }),
  finalize: (roomId: string) => invoke<RevealResponse>('reveal', { action: 'finalize', roomId }),
};

type ProfileUpdate = Omit<Extract<ProfileRequest, { action: 'update' }>, 'action'>;

export const profileApi = {
  get: (publicId: string) => invoke<ProfileView>('profile', { action: 'get', publicId }),
  update: (changes: ProfileUpdate) =>
    invoke<{ ok: true }>('profile', { action: 'update', ...changes }),
  photoUploadUrl: () => invoke<ProfileUploadUrl>('profile', { action: 'photo-upload-url' }),
  photoCommit: (path: string) => invoke<{ ok: true }>('profile', { action: 'photo-commit', path }),
  photoRemove: () => invoke<{ ok: true }>('profile', { action: 'photo-remove' }),
};

export const friendsApi = {
  list: () => invoke<FriendsListResponse>('friends', { action: 'list' }),
  request: (historyId: string) =>
    invoke<FriendsOkResponse>('friends', { action: 'request', historyId }),
  respond: (requestId: string, accept: boolean) =>
    invoke<FriendsOkResponse>('friends', { action: 'respond', requestId, accept }),
  addFromRoom: (historyId: string) =>
    invoke<FriendsOkResponse>('friends', { action: 'add-from-room', historyId }),
  remove: (publicId: string, report?: ReportReason) =>
    invoke<FriendsOkResponse>('friends', {
      action: 'remove',
      publicId,
      ...(report ? { report } : {}),
    }),
};

export const dmApi = {
  send: (threadId: string, body: string) =>
    invoke<DmOkResponse>('dm', { action: 'send', threadId, body }),
  read: (threadId: string) => invoke<DmOkResponse>('dm', { action: 'read', threadId }),
};
