import { describe, expect, it } from 'vitest';

import { hasActiveTable, pushRoute, ROUTES, venueTabTarget } from './navigation.ts';

const now = Date.parse('2026-09-26T12:00:00Z');

describe('venueTabTarget', () => {
  it('opens the venue screen while the table is active', () => {
    expect(venueTabTarget({ expires_at: '2026-09-26T13:00:00Z' }, now)).toBe(ROUTES.venue);
  });

  it('opens Keşfet without a table or once it expired', () => {
    expect(venueTabTarget(null, now)).toBe(ROUTES.explore);
    expect(venueTabTarget(undefined, now)).toBe(ROUTES.explore);
    expect(venueTabTarget({ expires_at: '2026-09-26T12:00:00Z' }, now)).toBe(ROUTES.explore);
    expect(hasActiveTable({ expires_at: '2026-09-26T11:59:59Z' }, now)).toBe(false);
  });
});

describe('pushRoute', () => {
  it('opens Mesajlar for a DM and Bildirimler for a friend request', () => {
    expect(pushRoute({ target: 'messages' })).toBe(ROUTES.messages);
    expect(pushRoute({ target: 'notifications' })).toBe(ROUTES.notifications);
  });

  it('maps the old /friends paths to the new places', () => {
    expect(pushRoute({ url: '/friends/requests' })).toBe(ROUTES.notifications);
    expect(pushRoute({ url: '/friends' })).toBe(ROUTES.messages);
    expect(pushRoute({ url: '/friends/3f1c9e2a-0000-4000-8000-000000000000' })).toBe(
      ROUTES.messages,
    );
  });

  it('opens nothing for an unknown, empty or malformed payload', () => {
    for (const data of [null, undefined, 'messages', 42, {}, { target: 'room' }, { url: '/x' }]) {
      expect(pushRoute(data)).toBeNull();
    }
  });
});
