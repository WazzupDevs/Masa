import { describe, expect, it } from 'vitest';

import {
  ANALYTICS_EVENTS,
  analyticsProperties,
  posthogPersonDeleteUrl,
  posthogPersonIds,
  posthogPersonLookupUrl,
  sessionDurationMinutes,
} from './analytics.ts';

describe('analytics events', () => {
  it('cover exactly the events of MVP_SPEC §12 and the v2 steps shipped so far (SPEC_V2 §13)', () => {
    expect([...ANALYTICS_EVENTS].sort()).toEqual(
      [
        'onboarding_completed',
        'check_in',
        'room_created',
        'join_requested',
        'join_accepted',
        'join_unavailable',
        'room_two_tables',
        'game_completed',
        'reveal_mutual',
        'reveal_none',
        'report_submitted',
        'block_created',
        'session_ended',
        'explore_viewed',
        'checkin_out_of_range',
      ].sort(),
    );
  });

  it('keep only the allowed properties of each event', () => {
    expect(
      analyticsProperties('room_created', {
        concept: 'tabu',
        visibility: 'open',
        phone: '+905551234567',
      } as never),
    ).toEqual({ concept: 'tabu', visibility: 'open' });
    expect(analyticsProperties('check_in', {} as never)).toEqual({});
    expect(analyticsProperties('game_completed', { concept: 'tabu', score: 4 })).toEqual({
      concept: 'tabu',
      score: 4,
    });
  });

  it('measures a table session in whole minutes', () => {
    expect(sessionDurationMinutes('2026-09-30T10:00:00Z', Date.parse('2026-09-30T10:42:40Z'))).toBe(
      43,
    );
    expect(sessionDurationMinutes('2026-09-30T10:00:00Z', Date.parse('2026-09-30T09:00:00Z'))).toBe(
      0,
    );
  });
});

describe('PostHog person deletion', () => {
  it('builds the lookup and delete requests', () => {
    expect(posthogPersonLookupUrl('https://eu.posthog.com', '123', 'user id')).toBe(
      'https://eu.posthog.com/api/projects/123/persons/?distinct_id=user%20id',
    );
    expect(posthogPersonDeleteUrl('https://eu.posthog.com', '123', 'p-1')).toBe(
      'https://eu.posthog.com/api/projects/123/persons/p-1/?delete_events=true',
    );
  });

  it('reads person ids defensively', () => {
    expect(posthogPersonIds({ results: [{ id: 'a' }, { id: 2 }, null, { id: 'b' }] })).toEqual([
      'a',
      'b',
    ]);
    expect(posthogPersonIds({})).toEqual([]);
    expect(posthogPersonIds(null)).toEqual([]);
  });
});
