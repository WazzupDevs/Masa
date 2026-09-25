// Keşfet (docs/SPEC_V2.md §4). The server buckets each venue's active tables; the app never sees a
// count. A planned event shows as a label while it runs or when it starts within EVENT_WINDOW_DAYS.

export const ACTIVITY_BUCKETS = ['calm', 'lively', 'buzzing'] as const;
export type ActivityBucket = (typeof ACTIVITY_BUCKETS)[number];

// 0–2 active tables look "calm" (so a single table can never be inferred), 3–5 "lively", 6+
// "buzzing". The cron job passes these to private.refresh_venue_activity; a test checks it does.
export const ACTIVITY_THRESHOLDS = { calmMax: 2, livelyMax: 5 } as const;
export const ACTIVITY_REFRESH_MINUTES = 5;

export function activityBucket(activeTables: number): ActivityBucket {
  if (activeTables <= ACTIVITY_THRESHOLDS.calmMax) return 'calm';
  if (activeTables <= ACTIVITY_THRESHOLDS.livelyMax) return 'lively';
  return 'buzzing';
}

export function isActivityBucket(value: unknown): value is ActivityBucket {
  return (ACTIVITY_BUCKETS as readonly unknown[]).includes(value);
}

export const EVENT_WINDOW_DAYS = 7;
export const EVENT_DEFAULT_HOURS = 3;
export const EVENT_TITLE_MAX = 60;

// Venues are in Türkiye (UTC+3, no daylight saving time); event times are shown in local time.
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type EventTime =
  | { kind: 'now' }
  | { kind: 'today' | 'tomorrow'; time: string }
  | { kind: 'weekday'; weekday: number; time: string };

function localParts(ms: number): { day: number; weekday: number; time: string } {
  const local = new Date(ms + ISTANBUL_OFFSET_MS);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return {
    day: Math.floor((ms + ISTANBUL_OFFSET_MS) / DAY_MS),
    weekday: local.getUTCDay(),
    time: `${hh}.${mm}`,
  };
}

// How to label an event relative to `now`: running, today, tomorrow, or a weekday within the week.
export function describeEventTime(startsAt: string, endsAt: string, now: number): EventTime {
  const start = Date.parse(startsAt);
  if (start <= now && now < Date.parse(endsAt)) return { kind: 'now' };
  const s = localParts(start);
  const today = localParts(now).day;
  if (s.day === today) return { kind: 'today', time: s.time };
  if (s.day === today + 1) return { kind: 'tomorrow', time: s.time };
  return { kind: 'weekday', weekday: s.weekday, time: s.time };
}

// Great-circle distance in metres (spherical Earth). The server's PostGIS check stays the rule;
// this only warns before the request (MVP_SPEC §4.2 and SPEC_V2 §4).
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
