// v2 navigation (docs/SPEC_V2.md §2): the app opens on Keşfet; the Mekan tab goes to the venue
// screen only while the table is active, otherwise to Keşfet.
export const ROUTES = {
  explore: '/',
  venue: '/venue',
  friends: '/friends',
  profile: '/profile',
  settings: '/profile/settings',
} as const;

export type ActiveTableLike = { expires_at: string } | null | undefined;

export function hasActiveTable(table: ActiveTableLike, now: number): boolean {
  return table !== null && table !== undefined && Date.parse(table.expires_at) > now;
}

export function venueTabTarget(table: ActiveTableLike, now: number): string {
  return hasActiveTable(table, now) ? ROUTES.venue : ROUTES.explore;
}
