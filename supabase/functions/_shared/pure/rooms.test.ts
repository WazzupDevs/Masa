import { describe, expect, it } from 'vitest';

import {
  isIntent,
  JOIN_REQUEST_TTL_SECONDS,
  MAX_JOIN_REQUESTS_PER_HOUR,
  proposalNotAccepted,
  proposalView,
  requesterStatus,
  ROOM_CHECK_COLUMNS,
  ROOM_CHECK_SECONDS,
  roomCheckDiffers,
  sessionChannel,
  venueChannel,
} from './rooms.ts';

describe('room rules', () => {
  it('matches the spec', () => {
    expect(JOIN_REQUEST_TTL_SECONDS).toBe(60);
    expect(MAX_JOIN_REQUESTS_PER_HOUR).toBe(10);
  });

  it('names data-free broadcast channels', () => {
    expect(venueChannel('v1')).toBe('venue:v1');
    expect(sessionChannel('s1')).toBe('session:s1');
  });
});

describe('requesterStatus', () => {
  const expiresAt = '2026-09-27T10:01:00.000Z';
  const before = Date.parse('2026-09-27T10:00:30.000Z');
  const after = Date.parse('2026-09-27T10:01:00.000Z');

  it('shows accepted at once', () => {
    expect(requesterStatus('accepted', expiresAt, before)).toBe('accepted');
  });

  it('keeps a pending request pending until it expires, then unavailable', () => {
    expect(requesterStatus('pending', expiresAt, before)).toBe('pending');
    expect(requesterStatus('pending', expiresAt, after)).toBe('unavailable');
  });

  it('never lets a requester tell unavailable from pending before expiry', () => {
    expect(requesterStatus('unavailable', expiresAt, before)).toBe('pending');
  });
});

describe('room status check', () => {
  const active = { status: 'active', owner_session_id: 'o', guest_session_id: 'g' };

  it('reads the columns it compares, often enough to catch a missed change in seconds', () => {
    expect(ROOM_CHECK_COLUMNS.split(', ').sort()).toEqual(
      ['guest_session_id', 'owner_session_id', 'status'].sort(),
    );
    expect(ROOM_CHECK_SECONDS).toBeLessThanOrEqual(5);
  });

  it('sees no difference when nothing the screen shows changed', () => {
    expect(roomCheckDiffers(active, { ...active })).toBe(false);
    expect(roomCheckDiffers(null, null)).toBe(false);
    expect(roomCheckDiffers(undefined, null)).toBe(false);
  });

  it('sees a closed room, a left guest and a room it can no longer read', () => {
    expect(roomCheckDiffers(active, { ...active, status: 'closed' })).toBe(true);
    expect(roomCheckDiffers(active, { ...active, status: 'waiting', guest_session_id: null })).toBe(
      true,
    );
    expect(roomCheckDiffers(active, null)).toBe(true);
    expect(roomCheckDiffers(null, active)).toBe(true);
  });
});

describe('game proposals on screen (docs/SPEC_V3.md §5.3)', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  const proposal = (proposer: string, secondsLeft: number) => ({
    proposer_session_id: proposer,
    concept: 'tabu' as const,
    expires_at: new Date(now + secondsLeft * 1000).toISOString(),
  });

  it("tells this table's proposal from the other's, and drops an expired one", () => {
    expect(proposalView(null, 'me', now)).toEqual({ kind: 'none' });
    expect(proposalView(proposal('me', 12), 'me', now)).toEqual({
      kind: 'mine',
      concept: 'tabu',
      secondsLeft: 12,
    });
    expect(proposalView(proposal('other', 30), 'me', now)).toMatchObject({ kind: 'theirs' });
    expect(proposalView(proposal('me', 0), 'me', now)).toEqual({ kind: 'none' });
    expect(proposalView(proposal('other', -3), 'me', now)).toEqual({ kind: 'none' });
  });

  // S7: a decline and a timeout look the same to the proposer; an accepted proposal starts a game.
  it("says 'not accepted' only when this table's proposal goes away without a game", () => {
    const mine = proposalView(proposal('me', 10), 'me', now);
    const gone = proposalView(null, 'me', now);
    const expired = proposalView(proposal('me', 10), 'me', now + 11_000);
    expect(proposalNotAccepted(mine, gone, false)).toBe(true);
    expect(proposalNotAccepted(mine, expired, false)).toBe(true);
    expect(proposalNotAccepted(mine, gone, true)).toBe(false);
    const theirs = proposalView(proposal('other', 10), 'me', now);
    expect(proposalNotAccepted(theirs, gone, false)).toBe(false);
  });

  it('knows the intents', () => {
    expect(isIntent('game')).toBe(true);
    expect(isIntent('chat')).toBe(true);
    expect(isIntent('sohbet')).toBe(false);
  });
});
