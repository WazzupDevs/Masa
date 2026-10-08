import type { ReportReason } from '../chat.ts';
import type { Reaction } from '../reactions.ts';

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
  // replyTo: a message of the same conversation (docs/SPEC_V3.md §21.1).
  | { action: 'send'; threadId: string; body: string; replyTo?: string }
  // The caller's one reaction on a message; null takes it back (§21.2).
  | { action: 'react'; messageId: string; emoji: Reaction | null }
  | { action: 'read'; threadId: string }
  // Mesajlar (docs/SPEC_V3.md §18.2): one row per friend, newest conversation first.
  | { action: 'inbox' }
  // The app is open: the caller's messages so far count as delivered, in every thread.
  | { action: 'delivered' };

export type DmOkResponse = { ok: true };
// The message as written (adım 9.1): the app puts it into its page at once, with status 'sent'.
export type DmSendResponse = { ok: true; messageId: string; createdAt: string };

// Of the caller's own messages only: the other member's times never reach the client.
export type DmStatus = 'sent' | 'delivered' | 'read';

export type DmInboxThread = {
  threadId: string | null;
  publicId: string;
  displayName: string | null;
  // Signed for an hour; null without a photo or when it is hidden.
  photoUrl: string | null;
  // The newest message, cut to 80 characters on the server; null without messages.
  lastBody: string | null;
  lastFromMe: boolean;
  lastMessageAt: string | null;
  unreadCount: number;
  // Only when the newest message is the caller's.
  lastStatus: DmStatus | null;
};

export type DmInboxResponse = { threads: DmInboxThread[] };
