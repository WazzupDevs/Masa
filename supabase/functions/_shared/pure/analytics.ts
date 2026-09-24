// Product analytics (MVP_SPEC §12). Only these events, only these properties, and the user id as
// the distinct id: never a phone number, alias, message, venue or position.
import type { Concept, Visibility } from './rooms.ts';

export type AnalyticsEventProps = {
  onboarding_completed: Record<string, never>;
  check_in: Record<string, never>;
  room_created: { concept: Concept; visibility: Visibility };
  join_requested: Record<string, never>;
  join_accepted: Record<string, never>;
  join_unavailable: Record<string, never>;
  room_two_tables: Record<string, never>;
  game_completed: { concept: Concept; score: number };
  reveal_mutual: Record<string, never>;
  reveal_none: Record<string, never>;
  report_submitted: Record<string, never>;
  block_created: Record<string, never>;
  session_ended: { duration_min: number };
};

export type AnalyticsEvent = keyof AnalyticsEventProps;

const ALLOWED: { [E in AnalyticsEvent]: readonly (keyof AnalyticsEventProps[E])[] } = {
  onboarding_completed: [],
  check_in: [],
  room_created: ['concept', 'visibility'],
  join_requested: [],
  join_accepted: [],
  join_unavailable: [],
  room_two_tables: [],
  game_completed: ['concept', 'score'],
  reveal_mutual: [],
  reveal_none: [],
  report_submitted: [],
  block_created: [],
  session_ended: ['duration_min'],
};

export const ANALYTICS_EVENTS = Object.keys(ALLOWED) as AnalyticsEvent[];

// Drops anything not on the event's list, so nothing personal can slip into an event.
export function analyticsProperties<E extends AnalyticsEvent>(
  event: E,
  props: AnalyticsEventProps[E],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of ALLOWED[event] as readonly string[]) {
    const value = (props as Record<string, unknown>)[key];
    if (typeof value === 'string' || typeof value === 'number') out[key] = value;
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
