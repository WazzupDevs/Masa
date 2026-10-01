import type { ReportReason } from '../chat.ts';

// `friends` and `dm` Edge Functions (docs/SPEC_V2.md §6, §9), shared with the mobile app. No
// response before a friendship carries a public_id.
export type FriendsRequest =
  | { action: 'list' }
  | { action: 'request'; historyId: string }
  // From a profiled venue chat message (docs/SPEC_V3.md §7.5). The sender of the request shows
  // the recipient their name, age and photo; the answer is { ok: true } whatever happens, except
  // already_friends.
  | { action: 'request'; venueChatMessageId: string }
  // Requests from the venue chat waiting for the caller: the sender's name, age and photo.
  | { action: 'incoming' }
  | { action: 'respond'; requestId: string; accept: boolean }
  | { action: 'add-from-room'; historyId: string }
  | { action: 'remove'; publicId: string; report?: ReportReason };

export type Friend = {
  publicId: string;
  displayName: string | null;
  // Signed for an hour; null without a photo or when it is hidden.
  photoUrl: string | null;
  since: string;
  threadId: string | null;
  lastMessageAt: string | null;
  unread: boolean;
};

export type FriendsListResponse = { friends: Friend[] };

export type VenueChatIncoming = {
  requestId: string;
  venueName: string | null;
  displayName: string | null;
  age: number | null;
  // Signed for an hour; null without a photo or when it is hidden.
  photoUrl: string | null;
  createdAt: string;
};
export type FriendsIncomingResponse = { requests: VenueChatIncoming[] };
export type FriendsOkResponse = { ok: true };

export type DmRequest =
  { action: 'send'; threadId: string; body: string } | { action: 'read'; threadId: string };

export type DmOkResponse = { ok: true };
