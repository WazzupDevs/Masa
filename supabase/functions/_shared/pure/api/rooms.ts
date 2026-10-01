import type { Concept, Intent } from '../rooms.ts';

// Request and response shapes of the `rooms` Edge Function, shared with the mobile app
// (docs/SPEC_V3.md §5, §11).
// "Oda kur": always open to the venue; an optional intent and the owner's choice for this room.
export type CreateRoomRequest = { action: 'create'; intent?: Intent; profiled: boolean };
// "Masanla oyna": a private one-table room, anonymous.
export type CreateSoloRoomRequest = { action: 'create-solo' };
export type RequestJoinRequest = { action: 'request-join'; roomId: string; profiled: boolean };
export type RespondRequest = { action: 'respond'; requestId: string; accept: boolean };
export type ProposeGameRequest = { action: 'propose-game'; roomId: string; concept: Concept };
export type AnswerGameRequest = { action: 'answer-game'; roomId: string; accept: boolean };
// "Oyunu bitir": the room returns to chat.
export type EndGameRequest = { action: 'end-game'; roomId: string };
export type EndRoomRequest = { action: 'end' };

export type RoomsRequest =
  | CreateRoomRequest
  | CreateSoloRoomRequest
  | RequestJoinRequest
  | RespondRequest
  | ProposeGameRequest
  | AnswerGameRequest
  | EndGameRequest
  | EndRoomRequest;

export type CreateRoomResponse = { roomId: string };
// Identical for every request: nothing in it depends on the owner's later answer.
export type RequestJoinResponse = { requestId: string; expiresAt: string };
export type ProposeGameResponse = { expiresAt: string };
export type RoomsOkResponse = { ok: true };
