import { describe, expect, it } from 'vitest';

import { buildQuery, countUnnamed, toVenuesFile } from './overpass.ts';

const response = {
  elements: [
    {
      type: 'way',
      id: 20,
      center: { lat: 41.01, lon: 28.65 },
      tags: { amenity: 'hookah_lounge', name: 'Nargile Evi' },
    },
    { type: 'node', id: 10, lat: 41.0, lon: 28.64, tags: { amenity: 'cafe', name: ' Kafe Bir ' } },
    { type: 'node', id: 11, lat: 41.0, lon: 28.64, tags: { amenity: 'cafe' } },
    {
      type: 'node',
      id: 12,
      lat: 41.0,
      lon: 28.64,
      tags: { amenity: 'restaurant', name: 'Lokanta' },
    },
    { type: 'way', id: 13, tags: { amenity: 'cafe', name: 'Konumsuz' } },
  ],
};

describe('buildQuery', () => {
  it('asks for cafes and hookah lounges inside the district', () => {
    const q = buildQuery();
    expect(q).toContain('["name"="Beylikdüzü"]');
    expect(q).toContain('^(cafe|hookah_lounge)$');
    expect(q).toContain('out center');
  });
});

describe('countUnnamed', () => {
  it('counts only cafes and hookah lounges without a name', () => {
    expect(countUnnamed(response)).toBe(1);
    expect(countUnnamed({})).toBe(0);
  });
});

describe('toVenuesFile', () => {
  it('keeps named, positioned cafes and hookah lounges, sorted by reference', () => {
    const file = toVenuesFile(response, '2026-09-26T00:00:00Z', null);
    expect(file.venues.map((v) => [v.sourceRef, v.name, v.lat, v.lng])).toEqual([
      ['node/10', 'Kafe Bir', 41.0, 28.64],
      ['way/20', 'Nargile Evi', 41.01, 28.65],
    ]);
    expect(file.attribution).toContain('OpenStreetMap');
  });

  it('keeps venues switched off during manual review switched off', () => {
    const first = toVenuesFile(response, 't1', null);
    const reviewed = {
      ...first,
      venues: first.venues.map((v) => ({ ...v, isActive: v.sourceRef !== 'way/20' })),
    };
    const again = toVenuesFile(response, 't2', reviewed);
    expect(again.venues.find((v) => v.sourceRef === 'way/20')?.isActive).toBe(false);
    expect(again.venues.find((v) => v.sourceRef === 'node/10')?.isActive).toBe(true);
  });

  it('rejects unexpected responses', () => {
    expect(() => toVenuesFile({ remark: 'error' }, 't', null)).toThrow();
  });
});
