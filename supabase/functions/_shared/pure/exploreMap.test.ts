import { describe, expect, it } from 'vitest';

import {
  MAP_ZOOM,
  mapPadding,
  MIN_BOUNDS_SPAN,
  venueBounds,
  venueCollection,
} from './exploreMap.ts';

const venue = (id: string, lat: number, lng: number, hasEvent = false) => ({
  id,
  name: `Mekan ${id}`,
  lat,
  lng,
  bucket: 'calm' as const,
  hasEvent,
  kind: 'cafe' as const,
});

describe('Keşfet map', () => {
  it('turns venues into GeoJSON points with what the layers read', () => {
    const collection = venueCollection([venue('a', 41.0, 28.6, true)]);
    expect(collection).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'a',
          geometry: { type: 'Point', coordinates: [28.6, 41.0] },
          properties: { id: 'a', name: 'Mekan a', bucket: 'calm', event: true, kind: 'cafe' },
        },
      ],
    });
  });

  it('fits every venue, not the average point (the map opened on the sea)', () => {
    const bounds = venueBounds([venue('a', 41.02, 28.62), venue('b', 40.99, 28.66)]);
    expect(bounds).toEqual([28.62, 40.99, 28.66, 41.02]);
  });

  it('does not zoom to the maximum on one venue or on venues next door', () => {
    const [w, s, e, n] = venueBounds([venue('a', 41.0, 28.6)]) ?? [];
    expect((e ?? 0) - (w ?? 0)).toBeCloseTo(MIN_BOUNDS_SPAN);
    expect((n ?? 0) - (s ?? 0)).toBeCloseTo(MIN_BOUNDS_SPAN);
    expect(((w ?? 0) + (e ?? 0)) / 2).toBeCloseTo(28.6);
    expect(venueBounds([])).toBeNull();
  });

  it('keeps pins clear of the header and the tab bar', () => {
    expect(mapPadding(120, 76, 24)).toEqual({ top: 144, bottom: 100, left: 24, right: 24 });
  });

  it('shows names only once clusters have split into single pins', () => {
    expect(MAP_ZOOM.labels).toBeGreaterThan(MAP_ZOOM.clusterMax);
  });
});
