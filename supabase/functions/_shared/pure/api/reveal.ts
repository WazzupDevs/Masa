// `reveal` Edge Function, shared with the mobile app. The result reaches both tables through
// rooms.reveal_result and rooms.reveal_token, never through this response.
export type RevealRequest =
  { action: 'decide'; roomId: string; wantsMeet: boolean } | { action: 'finalize'; roomId: string };
export type RevealResponse = { ok: true };
