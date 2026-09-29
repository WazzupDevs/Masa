// Keşfet map (docs/SPEC_V2.md §4): venues as GeoJSON points drawn by GL layers (clustered at low
// zoom), and the opening camera that fits every venue between the header and the tab bar.

export type MapVenue = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bucket: 'calm' | 'lively' | 'buzzing';
  hasEvent: boolean;
};

export type VenuePoint = {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [lng: number, lat: number] };
  properties: { id: string; name: string; bucket: MapVenue['bucket']; event: boolean };
};

export type VenueCollection = { type: 'FeatureCollection'; features: VenuePoint[] };

// [west, south, east, north]
export type Bounds = [number, number, number, number];

export const MAP_ZOOM = {
  // Clusters form up to this zoom; above it every venue is its own pin.
  clusterMax: 14,
  // Names show from this zoom on (and for the selected venue at any zoom).
  labels: 15,
} as const;

// Venues closer than this (in degrees, about 400 m) are not zoomed in on further: a single venue,
// or a few next door, open at street level rather than at the map's maximum zoom.
export const MIN_BOUNDS_SPAN = 0.004;

export function venueCollection(venues: readonly MapVenue[]): VenueCollection {
  return {
    type: 'FeatureCollection',
    features: venues.map((v) => ({
      type: 'Feature',
      id: v.id,
      geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
      properties: { id: v.id, name: v.name, bucket: v.bucket, event: v.hasEvent },
    })),
  };
}

// The box around every venue, widened to MIN_BOUNDS_SPAN on each axis; null without venues.
export function venueBounds(venues: readonly Pick<MapVenue, 'lat' | 'lng'>[]): Bounds | null {
  if (venues.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const v of venues) {
    west = Math.min(west, v.lng);
    east = Math.max(east, v.lng);
    south = Math.min(south, v.lat);
    north = Math.max(north, v.lat);
  }
  const widen = (lo: number, hi: number): [number, number] => {
    const missing = MIN_BOUNDS_SPAN - (hi - lo);
    return missing > 0 ? [lo - missing / 2, hi + missing / 2] : [lo, hi];
  };
  [west, east] = widen(west, east);
  [south, north] = widen(south, north);
  return [west, south, east, north];
}

// Camera padding: the header over the top of the map and the tab bar at its bottom, plus a margin
// so no pin sits on an edge.
export function mapPadding(headerHeight: number, tabBarHeight: number, margin: number) {
  return {
    top: headerHeight + margin,
    bottom: tabBarHeight + margin,
    left: margin,
    right: margin,
  };
}
