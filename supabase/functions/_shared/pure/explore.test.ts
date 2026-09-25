import { describe, expect, it } from 'vitest';

import { CHECKIN_RADIUS_M } from './checkin.ts';
import { activityBucket, describeEventTime, distanceMeters, isActivityBucket } from './explore.ts';

describe('activityBucket', () => {
  it('shows 0–2 active tables as calm, so a single table cannot be inferred', () => {
    expect([0, 1, 2].map(activityBucket)).toEqual(['calm', 'calm', 'calm']);
  });

  it('shows 3–5 as lively and 6 or more as buzzing', () => {
    expect([3, 5, 6, 40].map(activityBucket)).toEqual(['lively', 'lively', 'buzzing', 'buzzing']);
  });

  it('recognises bucket names', () => {
    expect(isActivityBucket('lively')).toBe(true);
    expect(isActivityBucket('3')).toBe(false);
  });
});

describe('describeEventTime', () => {
  // Friday 26 September 2026, 12:00 in Istanbul.
  const now = Date.parse('2026-09-26T09:00:00Z');

  it('labels a running event as now', () => {
    expect(describeEventTime('2026-09-26T08:00:00Z', '2026-09-26T11:00:00Z', now)).toEqual({
      kind: 'now',
    });
  });

  it('uses Istanbul time for today, tomorrow and weekdays', () => {
    expect(describeEventTime('2026-09-26T17:00:00Z', '2026-09-26T20:00:00Z', now)).toEqual({
      kind: 'today',
      time: '20.00',
    });
    // 22:30 UTC is already Saturday 01:30 in Istanbul.
    expect(describeEventTime('2026-09-26T22:30:00Z', '2026-09-27T01:30:00Z', now)).toEqual({
      kind: 'tomorrow',
      time: '01.30',
    });
    expect(describeEventTime('2026-09-29T17:00:00Z', '2026-09-29T20:00:00Z', now)).toEqual({
      kind: 'weekday',
      weekday: 2,
      time: '20.00',
    });
  });

  it('does not call an event that has ended "now"', () => {
    expect(describeEventTime('2026-09-26T05:00:00Z', '2026-09-26T09:00:00Z', now).kind).toBe(
      'today',
    );
  });
});

describe('distanceMeters', () => {
  it('is zero for the same point and close to PostGIS for short distances', () => {
    const a = { lat: 40.98819, lng: 28.66821 };
    expect(distanceMeters(a, a)).toBe(0);
    // 0.0027° of latitude is about 300 m.
    const d = distanceMeters(a, { lat: a.lat + 0.0027, lng: a.lng });
    expect(d).toBeGreaterThan(295);
    expect(d).toBeLessThan(305);
    expect(d > CHECKIN_RADIUS_M).toBe(true);
  });
});
