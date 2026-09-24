import { describe, expect, it } from 'vitest';

import {
  JOIN_REQUEST_TTL_SECONDS,
  MAX_JOIN_REQUESTS_PER_HOUR,
  requesterStatus,
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
