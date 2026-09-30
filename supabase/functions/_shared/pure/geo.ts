// Venue boundaries (docs/SPEC_V3.md §4). A boundary is a GeoJSON outer ring: [lng, lat] positions,
// closed (the last equals the first), counterclockwise. The server's PostGIS check stays the rule;
// withinBoundary only warns before the request, with the same tolerance. The seed validates rings
// with validateRing.

export type LngLat = readonly [number, number];
export type Point = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

// Metres east/north of `origin` (equirectangular; exact enough within a few kilometres).
function toLocal(origin: Point, [lng, lat]: LngLat): { x: number; y: number } {
  return {
    x: (lng - origin.lng) * RAD * EARTH_RADIUS_M * Math.cos(origin.lat * RAD),
    y: (lat - origin.lat) * RAD * EARTH_RADIUS_M,
  };
}

// Ray casting in lng/lat. A point exactly on an edge may fall either way; the tolerance covers it.
export function insideRing(point: Point, ring: readonly LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as LngLat;
    const [xj, yj] = ring[j] as LngLat;
    if (yi > point.lat !== yj > point.lat) {
      const x = ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
      if (point.lng < x) inside = !inside;
    }
  }
  return inside;
}

// Distance in metres from the point to the ring's nearest edge.
export function distanceToRingM(point: Point, ring: readonly LngLat[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = toLocal(point, ring[i] as LngLat);
    const b = toLocal(point, ring[i + 1] as LngLat);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSq));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}

// Inside the boundary, or at most toleranceM from it.
export function withinBoundary(point: Point, ring: readonly LngLat[], toleranceM: number): boolean {
  if (ring.length < 4) return false;
  return insideRing(point, ring) || distanceToRingM(point, ring) <= toleranceM;
}

// Shoelace sum in lng/lat: positive for a counterclockwise ring.
function signedArea(ring: readonly LngLat[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [x1, y1] = ring[i] as LngLat;
    const [x2, y2] = ring[i + 1] as LngLat;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function orientation(p: LngLat, q: LngLat, r: LngLat): number {
  const v = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  return v === 0 ? 0 : v > 0 ? 1 : -1;
}

function onSegment(p: LngLat, q: LngLat, r: LngLat): boolean {
  return (
    Math.min(p[0], r[0]) <= q[0] &&
    q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] &&
    q[1] <= Math.max(p[1], r[1])
  );
}

function segmentsIntersect(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && onSegment(a, c, b)) ||
    (o2 === 0 && onSegment(a, d, b)) ||
    (o3 === 0 && onSegment(c, a, d)) ||
    (o4 === 0 && onSegment(c, b, d))
  );
}

export type RingProblem =
  'too_few_points' | 'invalid_position' | 'not_closed' | 'self_intersecting' | 'clockwise';

// A ring the seed accepts: at least 4 positions (a triangle and the closing one), valid [lng, lat]
// numbers, closed, no edge crossing or touching a non-adjacent edge, counterclockwise.
export function validateRing(ring: readonly unknown[]): RingProblem | null {
  if (ring.length < 4) return 'too_few_points';
  const valid = ring.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      typeof p[0] === 'number' &&
      typeof p[1] === 'number' &&
      Math.abs(p[0]) <= 180 &&
      Math.abs(p[1]) <= 90,
  );
  if (!valid) return 'invalid_position';
  const pts = ring as readonly LngLat[];
  const first = pts[0] as LngLat;
  const last = pts[pts.length - 1] as LngLat;
  if (first[0] !== last[0] || first[1] !== last[1]) return 'not_closed';
  const edges = pts.length - 1;
  for (let i = 0; i < edges; i++) {
    for (let j = i + 1; j < edges; j++) {
      // Adjacent edges share a vertex, and so do the first and the last one.
      if (j === i + 1 || (i === 0 && j === edges - 1)) continue;
      if (
        segmentsIntersect(
          pts[i] as LngLat,
          pts[i + 1] as LngLat,
          pts[j] as LngLat,
          pts[j + 1] as LngLat,
        )
      ) {
        return 'self_intersecting';
      }
    }
  }
  // Repeated vertices also make a degenerate ring.
  const distinct = new Set(pts.slice(0, -1).map((p) => `${p[0]},${p[1]}`));
  if (distinct.size !== edges) return 'self_intersecting';
  const area = signedArea(pts);
  if (area === 0) return 'self_intersecting';
  if (area < 0) return 'clockwise';
  return null;
}
