// Room and join request rules (MVP_SPEC §4.3, §4.4). The SQL functions receive the numbers
// from here, so this is the single source.
export const JOIN_REQUEST_TTL_SECONDS = 60;
export const MAX_JOIN_REQUESTS_PER_HOUR = 10;
export const ROOM_IDLE_MINUTES = 10;

export const CONCEPTS = ['tabu', 'sohbet'] as const;
export const VISIBILITIES = ['private', 'open'] as const;
export type Concept = (typeof CONCEPTS)[number];
export type Visibility = (typeof VISIBILITIES)[number];

// Status of a join request as its requester may see it (public.my_join_requests).
export type RequesterStatus = 'pending' | 'accepted' | 'unavailable';

// Client-side twin of the view: flips to 'unavailable' exactly at expires_at, whatever the
// owner did, so a decline and a timeout look the same at the same moment (rule 5).
export function requesterStatus(
  viewStatus: RequesterStatus,
  expiresAt: string,
  now: number,
): RequesterStatus {
  if (viewStatus === 'accepted') return 'accepted';
  return Date.parse(expiresAt) > now ? 'pending' : 'unavailable';
}

// Realtime broadcast channels. Payloads are always empty: clients refetch through RLS.
export const venueChannel = (venueId: string): string => `venue:${venueId}`;
export const sessionChannel = (sessionId: string): string => `session:${sessionId}`;
// v2 (docs/SPEC_V2.md §7): the account's own inbox and a DM thread. Server broadcasts only.
export const inboxChannel = (userId: string): string => `inbox:${userId}`;
export const dmChannel = (threadId: string): string => `dm:${threadId}`;

export const BROADCAST = {
  lobbyChanged: 'lobby_changed',
  joinRequest: 'join_request',
  joinAccepted: 'join_accepted',
  // inbox:{user_id}
  friendRequest: 'friend_request',
  friendshipChanged: 'friendship_changed',
  dm: 'dm',
  // dm:{thread_id}
  dmMessage: 'dm_message',
} as const;

// The room screen's status check (apps/mobile/src/features/rooms/queries.ts): Realtime delivers a
// room change only to a channel subscribed at that moment and never replays it, so the screen also
// re-reads these columns every ROOM_CHECK_SECONDS, when the app comes to the foreground and when its
// channel (re)subscribes. Only when they differ from the cached row is the full row read again, so a
// check never overwrites a newer row that arrived over the channel (a Tabu press).
export const ROOM_CHECK_SECONDS = 4;
export const ROOM_CHECK_COLUMNS = 'status, owner_session_id, guest_session_id';

export type RoomCheck = {
  status: string;
  owner_session_id: string;
  guest_session_id: string | null;
};

// `checked` null: the room can no longer be read (the table is not a member any more).
export function roomCheckDiffers(
  cached: RoomCheck | null | undefined,
  checked: RoomCheck | null,
): boolean {
  if (cached == null || checked == null) return (cached == null) !== (checked == null);
  return (
    cached.status !== checked.status ||
    cached.owner_session_id !== checked.owner_session_id ||
    cached.guest_session_id !== checked.guest_session_id
  );
}
