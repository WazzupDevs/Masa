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

export const BROADCAST = {
  lobbyChanged: 'lobby_changed',
  joinRequest: 'join_request',
  joinAccepted: 'join_accepted',
} as const;
