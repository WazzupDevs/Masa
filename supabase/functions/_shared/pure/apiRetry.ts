// Which Edge Function calls the app sends once more after a 5xx (the server or the platform failed,
// often before the function ran). The measure is idempotence: a call is listed only when sending it
// twice leaves the same state and answer as sending it once, and an integration test sends it twice
// to show that (named next to each entry). Anything else may already have taken effect (a message
// sent, a request created), so its 5xx is shown to the user instead.
import type { CheckinRequest } from './api/checkin.ts';
import type { DmRequest, FriendsRequest } from './api/friends.ts';
import type { TabuRequest } from './api/games.ts';
import type { ProfileRequest } from './api/profile.ts';
import type { RevealRequest } from './api/reveal.ts';

// Every call the list below may name; a misspelled entry does not compile.
type CallName =
  | 'ping'
  | `checkin/${CheckinRequest['action']}`
  | `profile/${ProfileRequest['action']}`
  | `friends/${FriendsRequest['action']}`
  | `dm/${DmRequest['action']}`
  | `tabu/${TabuRequest['action']}`
  | `reveal/${RevealRequest['action']}`;

export const IDEMPOTENT_CALLS = [
  // updateGate.test "update gate, open": "answers the launch and foreground ping without a user"
  'ping',
  // profile.test "profile/get": "answers a stranger, an ex-member, a blocked and a blocking account
  // like an unknown id"
  'profile/get',
  // friends.test "no profile id before a friendship": "lists friends with name, photo, date and
  // thread only"
  'friends/list',
  // friends.test "DMs": "sends between friends only, filters profanity and limits the rate"
  'dm/read',
  // games.test "tabu, two tables face to face": "hands the turn's ordered card list to both tables,
  // and to nobody outside the room"
  'tabu/turn-cards',
  // games.test "tabu, two tables face to face": "ignores a second mark on the same card, a stale
  // turn and a card ahead, without an error"
  'tabu/mark',
  // games.test "tabu, two tables face to face": "alternates the tables, deals a new list per turn,
  // and ends turns idempotently"
  'tabu/end-turn',
  // reveal.test "reveal/finalize and cleanup": "does nothing before the window ends, then closes
  // with "none" for both"
  'reveal/finalize',
  // checkin.test "checkin/leave and expiry": "ends the active table and is idempotent"
  'checkin/leave',
] as const satisfies readonly CallName[];

export const RETRY_DELAY_MS = 500;

// "tabu/mark" for { action: 'mark' } sent to tabu; "ping" for a call without an action.
export function callName(fn: string, body: Record<string, unknown>): string {
  return typeof body.action === 'string' ? `${fn}/${body.action}` : fn;
}

// attempt: 1 for the first send.
export function retriesAfter(call: string, status: number, attempt: number): boolean {
  return attempt === 1 && status >= 500 && (IDEMPOTENT_CALLS as readonly string[]).includes(call);
}
