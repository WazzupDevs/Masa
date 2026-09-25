import { describe, expect, it } from 'vitest';

import {
  CHECKIN_RADIUS_M,
  HEADCOUNT_OPTIONS,
  headcountLabel,
  isValidHeadcount,
  isWithinCheckinRadius,
  MAX_HEADCOUNT,
  MIN_HEADCOUNT,
} from './checkin.ts';

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
  it('accepts 1 to 4 people (4 = 4+)', () => {
    expect(HEADCOUNT_OPTIONS.every(isValidHeadcount)).toBe(true);
    expect([0, 5, 6, 2.5].some(isValidHeadcount)).toBe(false);
  });

  it('offers exactly the accepted counts', () => {
    expect([...HEADCOUNT_OPTIONS]).toEqual([1, 2, 3, 4]);
    expect(HEADCOUNT_OPTIONS[0]).toBe(MIN_HEADCOUNT);
    expect(HEADCOUNT_OPTIONS.at(-1)).toBe(MAX_HEADCOUNT);
  });
});

describe('headcountLabel', () => {
  it('shows 4 and the v1 values above it as 4+', () => {
    expect([1, 2, 3].map(headcountLabel)).toEqual(['1', '2', '3']);
    expect([4, 5, 6].map(headcountLabel)).toEqual(['4+', '4+', '4+']);
  });
});
