// Product analytics (MVP_SPEC §12, docs/SPEC_V2.md §13). Only these events, only these properties, and the user id as
// the distinct id: never a phone number, alias, message, venue or position.
import type { GameMode } from './concepts.ts';
import type { FriendRequestSource, FriendshipSource } from './friends.ts';
import type { Participation } from './profile.ts';
import type { Concept, RoomIntentLabel } from './rooms.ts';
import type { SohbetTheme } from './sohbet.ts';
import type { TabuMode } from './tabu.ts';

export type AnalyticsEventProps = {
  // Sent after the optional photo/bio step; nothing is sent for a sign-up under 18 (rule 11).
  onboarding_completed: { with_photo: boolean; with_bio: boolean };
  // 1–4; 4 means "4+".
  check_in: { headcount: number };
  // v3 (docs/SPEC_V3.md §15): the intent ('none' without one) and the owner's choice for the room.
  room_created: { intent: RoomIntentLabel; profiled: boolean };
  // A proposal and its acceptance; the game only, never the other table.
  game_proposed: { concept: Concept };
  game_accepted: { concept: Concept };
  alias_rerolled: Record<string, never>;
  join_requested: Record<string, never>;
  join_accepted: Record<string, never>;
  join_unavailable: Record<string, never>;
  room_two_tables: Record<string, never>;
  // v2: + mode (docs/SPEC_V2.md §13); for voice Tabu the owner table's score (cooperative: the
  // team's) and, v3, the Tabu mode (docs/SPEC_V3.md §15).
  game_completed: { concept: Concept; score: number; mode: GameMode; tabu_mode?: TabuMode };
  // v3 step 7 (docs/SPEC_V3.md §19.1): a Tabu game stopped before its last turn, by "Oyunu bitir"
  // or a table leaving. The turn it stopped in and the game's length; nothing else.
  game_abandoned: { concept: Concept; turn_no: number; total_turns: number };
  reveal_mutual: Record<string, never>;
  reveal_none: Record<string, never>;
  report_submitted: Record<string, never>;
  block_created: Record<string, never>;
  session_ended: { duration_min: number };
  explore_viewed: { view: 'list' | 'map' };
  checkin_out_of_range: Record<string, never>;
  // "Bu noktadayım" or a spot change (docs/SPEC_V3.md §15); never which spot.
  spot_changed: Record<string, never>;
  participation_chosen: { mode: Participation };
  profile_photo_set: Record<string, never>;
  profile_bio_set: Record<string, never>;
  // A Sohbet card was opened in a room; the theme only, never the prompt.
  sohbet_card_opened: { theme: SohbetTheme };
  friend_request_sent: { source: FriendRequestSource };
  friend_request_accepted: Record<string, never>;
  friend_add_pressed: Record<string, never>;
  friendship_created: { source: FriendshipSource };
  dm_sent: Record<string, never>;
  // Venue chat (docs/SPEC_V3.md §15): never the venue, the text or the other side.
  venue_chat_sent: { profiled: boolean };
  venue_chat_reported: Record<string, never>;
};

export type AnalyticsEvent = keyof AnalyticsEventProps;

const ALLOWED: { [E in AnalyticsEvent]: readonly (keyof AnalyticsEventProps[E])[] } = {
  onboarding_completed: ['with_photo', 'with_bio'],
  check_in: ['headcount'],
  room_created: ['intent', 'profiled'],
  game_proposed: ['concept'],
  game_accepted: ['concept'],
  alias_rerolled: [],
  join_requested: [],
  join_accepted: [],
  join_unavailable: [],
  room_two_tables: [],
  game_completed: ['concept', 'score', 'mode', 'tabu_mode'],
  game_abandoned: ['concept', 'turn_no', 'total_turns'],
  reveal_mutual: [],
  reveal_none: [],
  report_submitted: [],
  block_created: [],
  session_ended: ['duration_min'],
  explore_viewed: ['view'],
  checkin_out_of_range: [],
  spot_changed: [],
  participation_chosen: ['mode'],
  profile_photo_set: [],
  profile_bio_set: [],
  sohbet_card_opened: ['theme'],
  friend_request_sent: ['source'],
  friend_request_accepted: [],
  friend_add_pressed: [],
  friendship_created: ['source'],
  dm_sent: [],
  venue_chat_sent: ['profiled'],
  venue_chat_reported: [],
};

export const ANALYTICS_EVENTS = Object.keys(ALLOWED) as AnalyticsEvent[];

// Drops anything not on the event's list, so nothing personal can slip into an event.
export function analyticsProperties<E extends AnalyticsEvent>(
  event: E,
  props: AnalyticsEventProps[E],
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const key of ALLOWED[event] as readonly string[]) {
    const value = (props as Record<string, unknown>)[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

export function sessionDurationMinutes(startedAt: string, endedAt: number): number {
  return Math.max(0, Math.round((endedAt - Date.parse(startedAt)) / 60_000));
}

// PostHog private API, used to delete a deleted account's person and events (MVP_SPEC §13 M7).
export const POSTHOG_DEFAULT_API_HOST = 'https://eu.posthog.com';

export function posthogPersonLookupUrl(
  host: string,
  projectId: string,
  distinctId: string,
): string {
  return `${host}/api/projects/${encodeURIComponent(projectId)}/persons/?distinct_id=${encodeURIComponent(distinctId)}`;
}

export function posthogPersonDeleteUrl(host: string, projectId: string, personId: string): string {
  return `${host}/api/projects/${encodeURIComponent(projectId)}/persons/${encodeURIComponent(personId)}/?delete_events=true`;
}

export function posthogPersonIds(response: unknown): string[] {
  if (typeof response !== 'object' || response === null || !('results' in response)) return [];
  const results = (response as { results: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results
    .map((p: unknown) => (typeof p === 'object' && p !== null ? (p as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === 'string');
}
