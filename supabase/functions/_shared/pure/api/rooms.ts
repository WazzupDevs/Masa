import type { Concept, Visibility } from '../rooms.ts';

// Request and response shapes of the `rooms` Edge Function, shared with the mobile app.
export type CreateRoomRequest = { action: 'create'; concept: Concept; visibility: Visibility };
export type RequestJoinRequest = { action: 'request-join'; roomId: string };
export type RespondRequest = { action: 'respond'; requestId: string; accept: boolean };
export type LeaveRoomRequest = { action: 'leave' };
export type EndRoomRequest = { action: 'end' };

export type RoomsRequest =
  CreateRoomRequest | RequestJoinRequest | RespondRequest | LeaveRoomRequest | EndRoomRequest;

export type CreateRoomResponse = { roomId: string };
// Identical for every request: nothing in it depends on the owner's later answer.
export type RequestJoinResponse = { requestId: string; expiresAt: string };
export type RoomsOkResponse = { ok: true };
