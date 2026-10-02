// v2 navigation (docs/SPEC_V2.md §2): the app opens on Keşfet; the Mekan tab goes to the venue
// screen only while the table is active, otherwise to Keşfet. v3 step 6 (docs/SPEC_V3.md §18.3):
// Keşfet · Aktiviteler · Mekan · Mesajlar · Profil; the friend list sits under Profil and the
// requests and play history ("Bildirimler") open from the bell.
export const ROUTES = {
  explore: '/explore',
  activities: '/activities',
  venue: '/venue',
  messages: '/messages',
  profile: '/profile',
  friends: '/profile/friends',
  settings: '/profile/settings',
  notifications: '/notifications',
} as const;

// Where a tapped push opens (the server sets `target`, pure/push.ts). Pushes from before step 6
// carry no data, or once carried a /friends path: those map to the new places. Anything else
// opens nothing, so an unknown or malformed payload never navigates.
export type PushTarget = 'messages' | 'notifications';

export function pushRoute(
  data: unknown,
): typeof ROUTES.messages | typeof ROUTES.notifications | null {
  if (typeof data !== 'object' || data === null) return null;
  const { target, url } = data as { target?: unknown; url?: unknown };
  if (target === 'messages') return ROUTES.messages;
  if (target === 'notifications') return ROUTES.notifications;
  if (typeof url === 'string') {
    if (url === '/friends/requests') return ROUTES.notifications;
    if (url === '/friends' || url.startsWith('/friends/')) return ROUTES.messages;
  }
  return null;
}

export type ActiveTableLike = { expires_at: string } | null | undefined;

export function hasActiveTable(table: ActiveTableLike, now: number): boolean {
  return table !== null && table !== undefined && Date.parse(table.expires_at) > now;
}

export function venueTabTarget(table: ActiveTableLike, now: number): string {
  return hasActiveTable(table, now) ? ROUTES.venue : ROUTES.explore;
}
