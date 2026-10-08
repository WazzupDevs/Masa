// Venue chat room (docs/SPEC_V3.md §7). One fixed group chat per venue, for the accounts with an
// active table there. The numbers here are the only source: the Edge Functions pass them to SQL.
import { MAX_MESSAGE_LENGTH, prepareMessage } from './chat.ts';

export const VENUE_CHAT = {
  maxLength: MAX_MESSAGE_LENGTH,
  // Per account: one message per 3 seconds, and at most 20 in 10 minutes.
  minIntervalMs: 3000,
  windowSeconds: 600,
  windowMax: 20,
  // A message reported by this many different accounts is hidden from everyone but its sender.
  hideAfterReports: 3,
  // A report keeps a copy of the venue's last visible messages.
  reportSnapshotSize: 50,
  // Messages are deleted after a day (hourly job).
  keepHours: 24,
  // Friend requests from the venue chat, per account per day; over it the answer is still ok.
  dailyFriendRequests: 10,
  // One page of messages.
  pageSize: 50,
} as const;

// The same trimming and length rule as the room chat.
export function prepareVenueMessage(raw: string): string | null {
  return prepareMessage(raw);
}

export type VenueChatRate = { windowStartedAt: number; count: number; lastSentAt: number };

export type RateDecision =
  { ok: true; next: VenueChatRate } | { ok: false; reason: 'too_soon' | 'rate_limited' };

// One account's sending window; the SQL function applies the same rule under a row lock.
export function venueChatRate(prev: VenueChatRate | null, now: number): RateDecision {
  if (prev && now - prev.lastSentAt < VENUE_CHAT.minIntervalMs) {
    return { ok: false, reason: 'too_soon' };
  }
  const fresh = !prev || now - prev.windowStartedAt >= VENUE_CHAT.windowSeconds * 1000;
  if (!fresh && prev.count >= VENUE_CHAT.windowMax) return { ok: false, reason: 'rate_limited' };
  return {
    ok: true,
    next: fresh
      ? { windowStartedAt: now, count: 1, lastSentAt: now }
      : { windowStartedAt: prev.windowStartedAt, count: prev.count + 1, lastSentAt: now },
  };
}

// Reports count once per account, never the sender's own.
export function shouldHide(reporters: readonly string[], senderId: string): boolean {
  return new Set(reporters.filter((r) => r !== senderId)).size >= VENUE_CHAT.hideAfterReports;
}

// One message as venue-chat/page returns it: a profiled message carries the display name, the
// photo (signed, if any) and no table alias; an anonymous one the alias, no name and no photo.
export type VenueChatMessage = {
  id: string;
  profiled: boolean;
  senderAlias: string | null;
  displayName: string | null;
  photoUrl: string | null;
  body: string;
  createdAt: string;
  fromMe: boolean;
};

// The name to show above a message.
export function senderLabel(
  message: Pick<VenueChatMessage, 'senderAlias' | 'displayName'>,
): string {
  return message.displayName ?? message.senderAlias ?? '';
}

export function venueChatChannel(venueId: string): string {
  return `venue_chat:${venueId}`;
}

export const VENUE_CHAT_BROADCAST = 'venue_chat' as const;
