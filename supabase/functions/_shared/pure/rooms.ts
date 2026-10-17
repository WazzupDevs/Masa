// Room and join request rules (MVP_SPEC §4.3, §4.4). The SQL functions receive the numbers
// from here, so this is the single source.
export const JOIN_REQUEST_TTL_SECONDS = 60;
export const MAX_JOIN_REQUESTS_PER_HOUR = 10;
// A one-sided room (waiting in the lobby, "Masanla oyna") closes after this much inactivity; a
// two-sided one never does (docs/SPEC_V3.md §23.G). The cron's argument.
export const ROOM_IDLE_MINUTES = 30;

// The games (Sesli Tabu, Sohbet kartları, Sahtekar, Harf Kapmaca, Şarkıda Geçsin, İbre). rooms.concept is the running game; null is
// chat (docs/SPEC_V3.md §5.1).
export const CONCEPTS = ['tabu', 'sohbet', 'sahtekar', 'harf', 'sarki', 'ibre'] as const;
// What rooms/propose-game accepts: CONCEPTS and the step 7 games whose screens are not in the app
// yet (docs/SPEC_V3.md §20). A game moves into CONCEPTS with its screens.
export const PROPOSABLE_CONCEPTS = [...CONCEPTS] as const;
export type ProposableConcept = (typeof PROPOSABLE_CONCEPTS)[number];
export const VISIBILITIES = ['private', 'open'] as const;
export type Concept = (typeof CONCEPTS)[number];
export type Visibility = (typeof VISIBILITIES)[number];

// The optional intent label of a room ("Oyun" / "Sohbet"), chosen when it is created (§5.2).
export const INTENTS = ['game', 'chat'] as const;
export type Intent = (typeof INTENTS)[number];
export type RoomIntentLabel = Intent | 'none';

export function isIntent(value: unknown): value is Intent {
  return (INTENTS as readonly unknown[]).includes(value);
}

// A game proposal waits this long for the other table (§5.3); the SQL functions get it from here.
export const GAME_PROPOSAL_TTL_SECONDS = 30;
// "Masa adını değiştir" per check-in (§5.6).
export const ALIAS_REROLLS_PER_CHECKIN = 3;

export type GameProposal = {
  proposer_session_id: string;
  // The side the proposal belongs to (docs/SPEC_V3.md §22.E); null on a row from before Faz 2.
  proposer_side: 'owner' | 'guest' | null;
  concept: Concept;
  expires_at: string;
};

// The proposal area of the room screen: nothing, this side's proposal waiting, or the other side's
// proposal to answer. A proposal past expires_at is gone on both screens at once. Faz 2: a proposal
// is its side's; a teammate's shows as this phone's own (only the other side answers it).
export type ProposalView =
  | { kind: 'none' }
  | { kind: 'mine'; concept: Concept; secondsLeft: number }
  | { kind: 'theirs'; concept: Concept; secondsLeft: number };

export function proposalView(
  proposal: GameProposal | null | undefined,
  me: { sessionId: string; side: 'owner' | 'guest' },
  now: number,
): ProposalView {
  if (!proposal) return { kind: 'none' };
  const left = Math.ceil((Date.parse(proposal.expires_at) - now) / 1000);
  if (!(left > 0)) return { kind: 'none' };
  const mine =
    proposal.proposer_side !== null
      ? proposal.proposer_side === me.side
      : proposal.proposer_session_id === me.sessionId;
  return {
    kind: mine ? 'mine' : 'theirs',
    concept: proposal.concept,
    secondsLeft: left,
  };
}

// "Öneri kabul edilmedi": this table's proposal went away without a game starting. A decline and a
// timeout look the same (S7); a decline shows at once.
export function proposalNotAccepted(
  before: ProposalView,
  after: ProposalView,
  gameRunning: boolean,
): boolean {
  return before.kind === 'mine' && after.kind === 'none' && !gameRunning;
}

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
// v3 step 6 (docs/SPEC_V3.md §18.2): the two members send here themselves, event TYPING with an
// empty payload that the receiver never reads.
export const dmTypingChannel = (threadId: string): string => `dm_typing:${threadId}`;
// The room chat's channel: Postgres Changes on messages, and the server's `reaction` broadcast.
export const messagesChannel = (roomId: string): string => `messages:${roomId}`;
export const TYPING_EVENT = 'typing' as const;

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
  // dm:{thread_id}: a status of the sender's messages moved (delivered or read); no data.
  dmStatus: 'dm_status',
  // docs/SPEC_V3.md §21.3: a reaction moved; no data. dm:{thread_id} and messages:{room_id}.
  dmReaction: 'dm_reaction',
  reaction: 'reaction',
} as const;

// The room screen's status check (apps/mobile/src/features/rooms/queries.ts): Realtime delivers a
// room change only to a channel subscribed at that moment and never replays it, so the screen also
// re-reads these columns every ROOM_CHECK_SECONDS, when the app comes to the foreground and when its
// channel (re)subscribes. Only when they differ from the cached row is the full row read again, so a
// check never overwrites a newer row that arrived over the channel (a Tabu press).
export const ROOM_CHECK_SECONDS = 4;
// The phones on each side too (docs/SPEC_V3.md §22.H): a phone joining or leaving changes the
// room's people and the title's count.
export const ROOM_CHECK_COLUMNS =
  'status, owner_session_id, guest_session_id, owner_phones, guest_phones';

export type RoomCheck = {
  status: string;
  owner_session_id: string;
  guest_session_id: string | null;
  owner_phones: number;
  guest_phones: number | null;
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
    cached.guest_session_id !== checked.guest_session_id ||
    cached.owner_phones !== checked.owner_phones ||
    cached.guest_phones !== checked.guest_phones
  );
}
