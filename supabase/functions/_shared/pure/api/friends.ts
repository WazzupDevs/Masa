import type { ReportReason } from '../chat.ts';

// `friends` and `dm` Edge Functions (docs/SPEC_V2.md §6, §9), shared with the mobile app. No
// response before a friendship carries a public_id.
export type FriendsRequest =
  | { action: 'list' }
  | { action: 'request'; historyId: string }
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
export type FriendsOkResponse = { ok: true };

export type DmRequest =
  { action: 'send'; threadId: string; body: string } | { action: 'read'; threadId: string };

export type DmOkResponse = { ok: true };
