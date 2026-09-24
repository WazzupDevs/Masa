// Check-in rules. The 300 m radius is also used by nearby_venues and the 4 hour duration by
// start_table_session (SQL); change them together.
export const CHECKIN_RADIUS_M = 300;
export const TABLE_SESSION_HOURS = 4;
export const MIN_HEADCOUNT = 1;
export const MAX_HEADCOUNT = 6;

// Strict: the device's accuracy radius is recorded but not added to the limit.
export function isWithinCheckinRadius(distanceM: number): boolean {
  return Number.isFinite(distanceM) && distanceM >= 0 && distanceM <= CHECKIN_RADIUS_M;
}

export function isValidHeadcount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_HEADCOUNT && n <= MAX_HEADCOUNT;
}
