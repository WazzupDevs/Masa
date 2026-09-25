// Which Edge Function calls the app sends once more after a 5xx (the server or the platform failed,
// often before the function ran). Only calls that read, or that the server applies at most once,
// are on the list; anything else may already have taken effect (a message sent, a request created),
// so its 5xx is shown to the user instead.
import type { FriendsRequest } from './api/friends.ts';
import type { TabuRequest } from './api/games.ts';
import type { ProfileRequest } from './api/profile.ts';

// Every call the list below may name; a misspelled entry does not compile.
type CallName =
  | 'ping'
  | `profile/${ProfileRequest['action']}`
  | `friends/${FriendsRequest['action']}`
  | `tabu/${TabuRequest['action']}`;

export const IDEMPOTENT_CALLS = [
  'ping', // does nothing but pass the update gate
  'profile/get', // reads
  'friends/list', // reads
  'tabu/turn-cards', // reads
  'tabu/mark', // one action per card index; a second one for the same card is ignored
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
