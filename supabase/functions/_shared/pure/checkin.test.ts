import { describe, expect, it } from 'vitest';

import { CHECKIN_RADIUS_M, isValidHeadcount, isWithinCheckinRadius } from './checkin.ts';

describe('isWithinCheckinRadius', () => {
  it('is strict at 300 m', () => {
    expect(CHECKIN_RADIUS_M).toBe(300);
    expect(isWithinCheckinRadius(0)).toBe(true);
    expect(isWithinCheckinRadius(300)).toBe(true);
    expect(isWithinCheckinRadius(300.01)).toBe(false);
  });

  it('rejects invalid distances', () => {
    expect(isWithinCheckinRadius(Number.NaN)).toBe(false);
    expect(isWithinCheckinRadius(-1)).toBe(false);
  });
});

describe('isValidHeadcount', () => {
  it('accepts 1 to 6 people', () => {
    expect([1, 6].every(isValidHeadcount)).toBe(true);
    expect([0, 7, 2.5].some(isValidHeadcount)).toBe(false);
  });
});
