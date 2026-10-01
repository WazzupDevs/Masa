import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCampusVenues } from './content.ts';
import { campusSql } from './sections.ts';

const RING = [
  [30.0, 40.0],
  [30.01, 40.0],
  [30.01, 40.01],
  [30.0, 40.01],
  [30.0, 40.0],
];

const campus = (overrides: Record<string, unknown> = {}) => ({
  venues: [
    {
      ref: 'kampus',
      name: 'Test Kampüsü',
      kind: 'campus',
      city: 'Sakarya',
      district: 'Serdivan',
      boundary: RING,
      spots: [
        { ref: 'kantin', name: 'Kantin' },
        { ref: 'kutuphane', name: "Kütüphane'nin önü" },
      ],
      ...overrides,
    },
  ],
});

describe('parseCampusVenues', () => {
  it('reads a venue with a boundary and spots; active by default', () => {
    const [venue] = parseCampusVenues(campus());
    expect(venue?.isActive).toBe(true);
    expect(venue?.spots.map((s) => [s.ref, s.isActive])).toEqual([
      ['kantin', true],
      ['kutuphane', true],
    ]);
  });

  it('refuses a boundary that is open, self-intersecting, clockwise or too short', () => {
    expect(() => parseCampusVenues(campus({ boundary: RING.slice(0, 4) }))).toThrow(/not_closed/);
    const bowTie = [
      [30, 40],
      [30.01, 40.01],
      [30.01, 40],
      [30, 40.01],
      [30, 40],
    ];
    expect(() => parseCampusVenues(campus({ boundary: bowTie }))).toThrow(/self_intersecting/);
    expect(() => parseCampusVenues(campus({ boundary: [...RING].reverse() }))).toThrow(/clockwise/);
    expect(() => parseCampusVenues(campus({ boundary: [RING[0], RING[1], RING[0]] }))).toThrow(
      /too_few_points/,
    );
    expect(() => parseCampusVenues(campus({ boundary: 'yok' }))).toThrow();
  });

  it('needs unique, well-formed spot refs and short names', () => {
    const twice = { ref: 'kantin', name: 'Kantin' };
    expect(() => parseCampusVenues(campus({ spots: [twice, twice] }))).toThrow(/duplicate/);
    expect(() => parseCampusVenues(campus({ spots: [{ ref: 'Kantin', name: 'K' }] }))).toThrow();
    expect(() =>
      parseCampusVenues(campus({ spots: [{ ref: 'k', name: 'x'.repeat(41) }] })),
    ).toThrow();
    // No spots is valid: the venue then asks for none at check-in.
    expect(parseCampusVenues(campus({ spots: [] }))[0]?.spots).toEqual([]);
    expect(parseCampusVenues(campus({ spots: undefined }))[0]?.spots).toEqual([]);
  });

  it('needs kind campus (docs/SPEC_V3.md §18.1)', () => {
    expect(parseCampusVenues(campus())[0]?.kind).toBe('campus');
    expect(() => parseCampusVenues(campus({ kind: undefined }))).toThrow(/kind is required/);
    expect(() => parseCampusVenues(campus({ kind: 'cafe' }))).toThrow(/kind must be campus/);
  });

  it('needs unique venue refs', () => {
    const one = campus().venues[0];
    expect(() => parseCampusVenues({ venues: [one, one] })).toThrow(/duplicate/);
  });
});

describe('campus location', () => {
  it('takes a location inside the boundary and refuses one outside or malformed', () => {
    const [venue] = parseCampusVenues(campus({ location: { lat: 40.005, lng: 30.005 } }));
    expect(venue?.location).toEqual({ lat: 40.005, lng: 30.005 });
    expect(parseCampusVenues(campus())[0]?.location).toBeNull();
    expect(() => parseCampusVenues(campus({ location: { lat: 40.02, lng: 30.005 } }))).toThrow(
      /outside the boundary/,
    );
    expect(() => parseCampusVenues(campus({ location: [30.005, 40.005] }))).toThrow(
      /must be \{ lat, lng \}/,
    );
  });

  it('writes the given point, else a point on the surface; no spot SQL without spots', () => {
    const given = campusSql(parseCampusVenues(campus({ location: { lat: 40.005, lng: 30.005 } })));
    expect(given).toContain('st_makepoint(30.005, 40.005)');
    expect(given).not.toContain('st_pointonsurface');
    const none = campusSql(parseCampusVenues(campus({ spots: [] })));
    expect(none).toContain('st_pointonsurface');
    expect(none).not.toContain('venue_spots');
  });
});

describe('campusSql', () => {
  it('upserts the venue with its boundary and point, then its spots in order', () => {
    const sql = campusSql(parseCampusVenues(campus({ isActive: false })));
    expect(sql).toContain('POLYGON((30 40, 30.01 40, 30.01 40.01, 30 40.01, 30 40))');
    expect(sql).toContain('extensions.st_pointonsurface(');
    expect(sql).toContain("'campus', 'kampus', 'campus', false)");
    expect(sql).toContain("('kantin', 'Kantin', 0, true)");
    expect(sql).toContain("('kutuphane', 'Kütüphane''nin önü', 1, true)");
    expect(sql).toContain('on conflict (venue_id, ref) do update');
    expect(sql).not.toContain('delete');
  });

  it('emits a comment when there are no venues', () => {
    expect(campusSql([])).toBe('-- content/venues-campus.json: no venues\n');
  });
});

describe('content/venues-campus.json', () => {
  it('is valid', () => {
    const json: unknown = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../content/venues-campus.json'), 'utf8'),
    );
    expect(parseCampusVenues(json).length).toBeGreaterThan(0);
  });

  it('opens the campus without spots, with its point inside the boundary (S1)', () => {
    const json: unknown = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../content/venues-campus.json'), 'utf8'),
    );
    const campusVenue = parseCampusVenues(json).find((v) => v.ref === 'sau-esentepe');
    expect(campusVenue?.isActive).toBe(true);
    expect(campusVenue?.location).toEqual({ lat: 40.741282, lng: 30.331469 });
    expect(campusVenue?.boundary).toHaveLength(14);
    expect(campusVenue?.spots.filter((s) => s.isActive)).toEqual([]);
  });
});
