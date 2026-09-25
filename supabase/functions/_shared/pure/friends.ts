// Friends, play history and DMs (docs/SPEC_V2.md §6). The SQL functions apply the same rules; the
// integration tests check that both agree.

// An encounter enters the history only if the room stayed two-table this long
// (private.on_room_encounter uses the same interval).
export const ENCOUNTER_MIN_MINUTES = 3;

export function isEncounterLongEnough(guestJoinedAt: string, endedAt: number): boolean {
  return endedAt - Date.parse(guestJoinedAt) >= ENCOUNTER_MIN_MINUTES * 60_000;
}

// DMs: 1–500 characters, one message per second per account (dm_send's min interval).
export const DM_MAX_LENGTH = 500;
export const DM_MIN_INTERVAL_MS = 1000;
export const DM_PAGE_SIZE = 50;

export function prepareDm(raw: string): string | null {
  const body = raw.trim();
  const length = [...body].length;
  return length >= 1 && length <= DM_MAX_LENGTH ? body : null;
}

// What the sender sees of a request: a decline, and a removal from the friend list, look like a
// request still waiting, for ever.
export type StoredRequestStatus = 'pending' | 'accepted' | 'declined' | 'removed';
export type SentRequestView = 'pending' | 'accepted';

export function sentRequestView(status: StoredRequestStatus): SentRequestView {
  return status === 'accepted' ? 'accepted' : 'pending';
}

// Which friend action a history row offers. A mutual "Evet" offers only "Arkadaş ekle"; any other
// encounter offers "İstek gönder". After a press the row only says it was done, whatever the
// server did with it (§6.2, §6.5).
export type HistoryAction = 'add_friend' | 'send_request' | 'done';

export function historyAction(row: {
  reveal_mutual: boolean;
  friend_action_at: string | null;
}): HistoryAction {
  if (row.friend_action_at !== null) return 'done';
  return row.reveal_mutual ? 'add_friend' : 'send_request';
}

export const FRIEND_REQUEST_SOURCES = ['history', 'room_end'] as const;
export type FriendRequestSource = (typeof FRIEND_REQUEST_SOURCES)[number];
export const FRIENDSHIP_SOURCES = ['room_end_mutual', 'request'] as const;
export type FriendshipSource = (typeof FRIENDSHIP_SOURCES)[number];
