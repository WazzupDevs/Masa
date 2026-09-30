// Check-in rules. The 300 m radius is also used by nearby_venues and the 4 hour duration by
// start_table_session (SQL); change them together.
export const CHECKIN_RADIUS_M = 300;
export const TABLE_SESSION_HOURS = 4;
export const MIN_HEADCOUNT = 1;
// "Kaç kişisiniz?" 1 / 2 / 3 / 4+: 4 is stored for four or more (docs/SPEC_V2.md §6.6).
export const MAX_HEADCOUNT = 4;
export const HEADCOUNT_OPTIONS = [1, 2, 3, 4] as const;

// Strict: the device's accuracy radius is recorded but not added to the limit.
export function isWithinCheckinRadius(distanceM: number): boolean {
  return Number.isFinite(distanceM) && distanceM >= 0 && distanceM <= CHECKIN_RADIUS_M;
}

export function isValidHeadcount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_HEADCOUNT && n <= MAX_HEADCOUNT;
}

// How a stored headcount is shown: "4+" for 4, and for the 5–6 of v1 sessions that ended before
// the change.
export function headcountLabel(n: number): string {
  return n >= MAX_HEADCOUNT ? `${MAX_HEADCOUNT}+` : String(n);
}

// A venue with a boundary (the campus) takes a check-in inside it or at most this far outside: GPS
// drifts 30–50 m inside buildings (docs/SPEC_V3.md §4.2). venue_contains takes it as a parameter;
// the app's warning uses it too (geo.ts → withinBoundary).
export const BOUNDARY_TOLERANCE_M = 50;
