import { describe, expect, it } from 'vitest';

import { offset } from '../../../tests/fixtures/venues.ts';
import { BOUNDARY_TOLERANCE_M } from './checkin.ts';
import { distanceToRingM, insideRing, type LngLat, validateRing, withinBoundary } from './geo.ts';

// A 300 m × 300 m square around a made-up centre, counterclockwise from the south-west corner.
const CENTER = { lat: 40.5, lng: 30.0 };
const HALF = 150;
const corner = (bearing: number): LngLat => {
  const p = offset(CENTER, HALF * Math.SQRT2, bearing);
  return [p.lng, p.lat];
};
const SQUARE: LngLat[] = [corner(225), corner(135), corner(45), corner(315), corner(225)];

describe('withinBoundary', () => {
  it('takes the inside, the middle of an edge and a corner', () => {
    expect(BOUNDARY_TOLERANCE_M).toBe(50);
    expect(withinBoundary(CENTER, SQUARE, BOUNDARY_TOLERANCE_M)).toBe(true);
    expect(withinBoundary(offset(CENTER, HALF, 90), SQUARE, BOUNDARY_TOLERANCE_M)).toBe(true);
    const [lng, lat] = corner(45);
    expect(withinBoundary({ lat, lng }, SQUARE, BOUNDARY_TOLERANCE_M)).toBe(true);
  });

  it('takes 40 m outside an edge and refuses 60 m (50 m tolerance)', () => {
    for (const bearing of [0, 90, 180, 270]) {
      expect(withinBoundary(offset(CENTER, HALF + 40, bearing), SQUARE, 50)).toBe(true);
      expect(withinBoundary(offset(CENTER, HALF + 60, bearing), SQUARE, 50)).toBe(false);
    }
  });

  it('measures past a corner diagonally', () => {
    // 40 m beyond the corner along the diagonal is 40 m from the ring.
    const near = offset(CENTER, HALF * Math.SQRT2 + 40, 45);
    const far = offset(CENTER, HALF * Math.SQRT2 + 60, 45);
    expect(withinBoundary(near, SQUARE, 50)).toBe(true);
    expect(withinBoundary(far, SQUARE, 50)).toBe(false);
  });

  it('refuses a far point and an unusable ring', () => {
    expect(withinBoundary(offset(CENTER, 2000, 10), SQUARE, 50)).toBe(false);
    expect(withinBoundary(CENTER, SQUARE.slice(0, 3), 50)).toBe(false);
  });

  it('measures the distance to the nearest edge', () => {
    expect(insideRing(CENTER, SQUARE)).toBe(true);
    expect(distanceToRingM(CENTER, SQUARE)).toBeCloseTo(HALF, -1);
    expect(distanceToRingM(offset(CENTER, HALF + 100, 0), SQUARE)).toBeCloseTo(100, -1);
  });
});

describe('validateRing', () => {
  it('accepts a closed counterclockwise ring', () => {
    expect(validateRing(SQUARE)).toBeNull();
    expect(
      validateRing([
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 0],
      ]),
    ).toBeNull();
  });

  it('needs at least four positions and valid numbers', () => {
    expect(
      validateRing([
        [0, 0],
        [1, 0],
        [0, 0],
      ]),
    ).toBe('too_few_points');
    expect(
      validateRing([
        [0, 0],
        [1, 0],
        [0, 91],
        [0, 0],
      ]),
    ).toBe('invalid_position');
    expect(
      validateRing([
        [0, 0],
        [1, 0],
        ['0', 1],
        [0, 0],
      ]),
    ).toBe('invalid_position');
    expect(
      validateRing([
        [0, 0],
        [1, 0],
        [0, 1, 2],
        [0, 0],
      ]),
    ).toBe('invalid_position');
  });

  it('needs the ring closed', () => {
    expect(
      validateRing([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    ).toBe('not_closed');
  });

  it('refuses a self-intersecting or degenerate ring', () => {
    // A bow tie: (0,0)→(1,1) crosses (1,0)→(0,1).
    expect(
      validateRing([
        [0, 0],
        [1, 1],
        [1, 0],
        [0, 1],
        [0, 0],
      ]),
    ).toBe('self_intersecting');
    // A vertex visited twice.
    expect(
      validateRing([
        [0, 0],
        [2, 0],
        [1, 1],
        [2, 2],
        [1, 1],
        [0, 2],
        [0, 0],
      ]),
    ).toBe('self_intersecting');
    // All on one line.
    expect(
      validateRing([
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 0],
      ]),
    ).toBe('self_intersecting');
  });

  it('refuses a clockwise ring', () => {
    expect(validateRing([...SQUARE].reverse())).toBe('clockwise');
  });
});
