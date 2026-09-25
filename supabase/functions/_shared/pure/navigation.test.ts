import { describe, expect, it } from 'vitest';

import { hasActiveTable, ROUTES, venueTabTarget } from './navigation.ts';

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
