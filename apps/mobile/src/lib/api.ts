import { FunctionsHttpError } from '@supabase/supabase-js';
import type { AccountRequest, AccountResponse } from '@shared/api/account.ts';
import type { ChatResponse, ReactResponse, SafetyResponse } from '@shared/api/chat.ts';
import type { Reaction } from '@shared/reactions.ts';
import type { RevealResponse } from '@shared/api/reveal.ts';
import type {
  GameOkResponse,
  TabuStartResponse,
  TabuTurnCardsResponse,
  SahtekarOptionsResponse,
  SahtekarStartResponse,
  SahtekarViewResponse,
  SayStartResponse,
  IbreStartResponse,
  IbreTargetResponse,
} from '@shared/api/games.ts';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  ProposeGameResponse,
  RequestJoinResponse,
  RoomsOkResponse,
} from '@shared/api/rooms.ts';
import type {
  ChangeSpotResponse,
  CheckInRequest,
  CheckInResponse,
  LeaveResponse,
  LocationModeResponse,
  RerollAliasResponse,
} from '@shared/api/checkin.ts';
import type {
  DmInboxResponse,
  DmOkResponse,
  DmSendResponse,
  FriendsIncomingResponse,
  FriendsListResponse,
  FriendsOkResponse,
} from '@shared/api/friends.ts';
import type {
  ChatProfileView,
  ProfileRequest,
  ProfileUploadUrl,
  ProfileView,
} from '@shared/api/profile.ts';
import type { VenueChatPageResponse, VenueChatResponse } from '@shared/api/venueChat.ts';
import type { ReportReason } from '@shared/chat.ts';
import type { Concept } from '@shared/rooms.ts';
import type { SayKind } from '@shared/sayChallenge.ts';
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

// Whether the server skips the location check (dev project only).
export function callLocationMode(): Promise<LocationModeResponse> {
  return invoke<LocationModeResponse>('checkin', { action: 'location-mode' });
}

// "Bu noktadayım" and changing the spot (docs/SPEC_V3.md §4.3).
export function callChangeSpot(spotId: string): Promise<ChangeSpotResponse> {
  return invoke<ChangeSpotResponse>('checkin', { action: 'change-spot', spotId });
}

// "Masa adını değiştir" (docs/SPEC_V3.md §5.6).
export function callRerollAlias(): Promise<RerollAliasResponse> {
  return invoke<RerollAliasResponse>('checkin', { action: 'reroll-alias' });
}

export function callLeave(): Promise<LeaveResponse> {
  return invoke<LeaveResponse>('checkin', { action: 'leave' });
}

// Rooms (docs/SPEC_V3.md §5): "Oda kur" is always open; "Masanla oyna" is a private one-table
// room; a two-table game starts only from an accepted proposal; "Odayı bitir" is the only exit.
export const roomsApi = {
  create: (body: Omit<CreateRoomRequest, 'action'>) =>
    invoke<CreateRoomResponse>('rooms', { action: 'create', ...body }),
  createSolo: () => invoke<CreateRoomResponse>('rooms', { action: 'create-solo' }),
  requestJoin: (roomId: string, profiled: boolean) =>
    invoke<RequestJoinResponse>('rooms', { action: 'request-join', roomId, profiled }),
  respond: (requestId: string, accept: boolean) =>
    invoke<RoomsOkResponse>('rooms', { action: 'respond', requestId, accept }),
  // `players`: Sahtekar only, the table's count (1-4); without it the server takes the check-in
  // headcount (docs/SPEC_V3.md §20.2a).
  proposeGame: (roomId: string, concept: Concept, players?: number) =>
    invoke<ProposeGameResponse>('rooms', {
      action: 'propose-game',
      roomId,
      concept,
      ...(players ? { players } : {}),
    }),
  answerGame: (roomId: string, accept: boolean, players?: number) =>
    invoke<RoomsOkResponse>('rooms', {
      action: 'answer-game',
      roomId,
      accept,
      ...(players ? { players } : {}),
    }),
  endGame: (roomId: string) => invoke<RoomsOkResponse>('rooms', { action: 'end-game', roomId }),
  end: () => invoke<RoomsOkResponse>('rooms', { action: 'end' }),
};

export const chatApi = {
  send: (roomId: string, body: string, replyTo?: string) =>
    invoke<ChatResponse>('chat', { action: 'send', roomId, body, ...(replyTo ? { replyTo } : {}) }),
  // docs/SPEC_V3.md §21.2: the table's one reaction; null takes it back.
  react: (messageId: string, emoji: Reaction | null) =>
    invoke<ReactResponse>('chat', { action: 'react', messageId, emoji }),
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
  // Venue chat (docs/SPEC_V3.md §7.4, §7.5).
  reportVenueChat: (messageId: string, reason: ReportReason) =>
    invoke<SafetyResponse>('safety', {
      action: 'report',
      target: 'venue_chat',
      messageId,
      reason,
    }),
  blockVenueChat: (venueChatMessageId: string, report?: ReportReason) =>
    invoke<SafetyResponse>('safety', {
      action: 'block',
      venueChatMessageId,
      ...(report ? { report } : {}),
    }),
  reportFriendRequest: (requestId: string, reason: ReportReason) =>
    invoke<SafetyResponse>('safety', {
      action: 'report',
      target: 'friend_request',
      requestId,
      reason,
    }),
  blockFriendRequest: (friendRequestId: string, report?: ReportReason) =>
    invoke<SafetyResponse>('safety', {
      action: 'block',
      friendRequestId,
      ...(report ? { report } : {}),
    }),
  unblock: (blockId: string) => invoke<SafetyResponse>('safety', { action: 'unblock', blockId }),
};

export const gamesApi = {
  // One-table rooms only: the deck, and the room's activity becomes Tabu. A two-table game starts
  // from an accepted proposal (roomsApi.answerGame).
  tabuStart: (roomId: string) => invoke<TabuStartResponse>('tabu', { action: 'start', roomId }),
  tabuTurnCards: (roomId: string) =>
    invoke<TabuTurnCardsResponse>('tabu', { action: 'turn-cards', roomId }),
  tabuMark: (roomId: string, mark: Mark) =>
    invoke<GameOkResponse>('tabu', { action: 'mark', roomId, ...mark }),
  tabuEndTurn: (roomId: string) => invoke<GameOkResponse>('tabu', { action: 'end-turn', roomId }),
  tabuBeginTurn: (roomId: string) =>
    invoke<GameOkResponse>('tabu', { action: 'begin-turn', roomId }),
  sohbetNext: (roomId: string) => invoke<GameOkResponse>('sohbet', { action: 'next-card', roomId }),
  // Sahtekar (docs/SPEC_V3.md §20.2): the one-table deck, then the two-table game's actions.
  sahtekarStart: (roomId: string) =>
    invoke<SahtekarStartResponse>('sahtekar', { action: 'start', roomId }),
  sahtekarView: (roomId: string, seat: string) =>
    invoke<SahtekarViewResponse>('sahtekar', { action: 'view', roomId, seat }),
  sahtekarSaid: (roomId: string, step: number) =>
    invoke<GameOkResponse>('sahtekar', { action: 'said', roomId, step }),
  sahtekarVote: (roomId: string, voter: string, target: string) =>
    invoke<GameOkResponse>('sahtekar', { action: 'vote', roomId, voter, target }),
  sahtekarOptions: (roomId: string) =>
    invoke<SahtekarOptionsResponse>('sahtekar', { action: 'options', roomId }),
  sahtekarGuess: (roomId: string, option: string) =>
    invoke<GameOkResponse>('sahtekar', { action: 'guess', roomId, option }),
  sahtekarAdvance: (roomId: string) =>
    invoke<GameOkResponse>('sahtekar', { action: 'advance', roomId }),
  // Harf Kapmaca and Şarkıda Geçsin (docs/SPEC_V3.md §20.3–20.4): the same actions; Harf claims
  // a letter, Şarkı sings a line.
  sayStart: (kind: SayKind, roomId: string) =>
    invoke<SayStartResponse>(kind, { action: 'start', roomId }),
  sayBegin: (kind: SayKind, roomId: string) =>
    invoke<GameOkResponse>(kind, { action: 'begin', roomId }),
  sayClaim: (kind: SayKind, roomId: string, round: number, step: number, letter: string | null) =>
    invoke<GameOkResponse>(
      kind,
      kind === 'harf'
        ? { action: 'claim', roomId, round, step, letter }
        : { action: 'said', roomId, round, step },
    ),
  sayObject: (kind: SayKind, roomId: string, round: number, step: number) =>
    invoke<GameOkResponse>(kind, { action: 'object', roomId, round, step }),
  sayAdvance: (kind: SayKind, roomId: string) =>
    invoke<GameOkResponse>(kind, { action: 'advance', roomId }),
  // İbre (docs/SPEC_V3.md §20.5).
  ibreStart: (roomId: string) => invoke<IbreStartResponse>('ibre', { action: 'start', roomId }),
  ibreBegin: (roomId: string) => invoke<GameOkResponse>('ibre', { action: 'begin', roomId }),
  ibreTarget: (roomId: string, round: number) =>
    invoke<IbreTargetResponse>('ibre', { action: 'target', roomId, round }),
  ibreLock: (roomId: string, round: number, value: number) =>
    invoke<GameOkResponse>('ibre', { action: 'lock', roomId, round, value }),
  ibreSide: (roomId: string, round: number, side: 'left' | 'right') =>
    invoke<GameOkResponse>('ibre', { action: 'side', roomId, round, side }),
  ibreAdvance: (roomId: string) => invoke<GameOkResponse>('ibre', { action: 'advance', roomId }),
};

export const revealApi = {
  decide: (roomId: string, wantsMeet: boolean) =>
    invoke<RevealResponse>('reveal', { action: 'decide', roomId, wantsMeet }),
  finalize: (roomId: string) => invoke<RevealResponse>('reveal', { action: 'finalize', roomId }),
};

type ProfileUpdate = Omit<Extract<ProfileRequest, { action: 'update' }>, 'action'>;

export const profileApi = {
  get: (publicId: string) => invoke<ProfileView>('profile', { action: 'get', publicId }),
  getFromVenueChat: (venueChatMessageId: string) =>
    invoke<ChatProfileView>('profile', { action: 'get', venueChatMessageId }),
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
  requestFromVenueChat: (venueChatMessageId: string) =>
    invoke<FriendsOkResponse>('friends', { action: 'request', venueChatMessageId }),
  incoming: () => invoke<FriendsIncomingResponse>('friends', { action: 'incoming' }),
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

export const venueChatApi = {
  send: (venueId: string, body: string, profiled: boolean) =>
    invoke<VenueChatResponse>('venue-chat', { action: 'send', venueId, body, profiled }),
  reply: (venueId: string, body: string, profiled: boolean, replyTo: string) =>
    invoke<VenueChatResponse>('venue-chat', { action: 'send', venueId, body, profiled, replyTo }),
  // At most 10 per 10 seconds; over it rate_limited, which the app ignores (§21.2).
  react: (messageId: string, emoji: Reaction | null) =>
    invoke<ReactResponse>('venue-chat', { action: 'react', messageId, emoji }),
  page: (venueId: string) =>
    invoke<VenueChatPageResponse>('venue-chat', { action: 'page', venueId }),
};

export const dmApi = {
  send: (threadId: string, body: string, replyTo?: string) =>
    invoke<DmSendResponse>('dm', {
      action: 'send',
      threadId,
      body,
      ...(replyTo ? { replyTo } : {}),
    }),
  react: (messageId: string, emoji: Reaction | null) =>
    invoke<ReactResponse>('dm', { action: 'react', messageId, emoji }),
  read: (threadId: string) => invoke<DmOkResponse>('dm', { action: 'read', threadId }),
  // Mesajlar (docs/SPEC_V3.md §18.2): one row per friend, photos signed by the function.
  inbox: () => invoke<DmInboxResponse>('dm', { action: 'inbox' }),
  // The app is open: messages so far count as delivered, in every conversation.
  delivered: () => invoke<DmOkResponse>('dm', { action: 'delivered' }),
};
