import { describe, expect, it } from 'vitest';

import { parseAliasWords, parseTestVenues, parseVenuesFile } from './content.ts';
import { aliasWordsSql, cardsSql, testSpotsSql, venuesSql } from './sections.ts';

const venue = {
  name: "Ayşe'nin Kafesi",
  city: 'İstanbul',
  district: 'Beylikdüzü',
  lat: 41.0,
  lng: 28.64,
  source: 'osm',
  sourceRef: 'node/1',
  kind: 'cafe' as const,
  amenity: 'cafe',
  isActive: true,
};

describe('aliasWordsSql', () => {
  it('replaces the word list', () => {
    const sql = aliasWordsSql({ adjectives: ['Mor'], nouns: ['Baykuş'] });
    expect(sql).toContain('delete from public.alias_words;');
    expect(sql).toContain("('adjective', 'Mor')");
    expect(sql).toContain("('noun', 'Baykuş')");
  });
});

describe('venuesSql', () => {
  it('upserts by source reference with lng/lat order for PostGIS', () => {
    const sql = venuesSql([venue]);
    expect(sql).toContain("'Ayşe''nin Kafesi'");
    expect(sql).toContain('st_makepoint(28.64, 41)');
    expect(sql).toContain('on conflict (source, source_ref) do update');
  });

  it('emits a comment when there are no venues', () => {
    expect(venuesSql([])).toBe('-- content/venues-pilot.json: no venues\n');
  });

  it('labels test venues without the OSM attribution', () => {
    const sql = venuesSql(
      parseTestVenues({
        venues: [{ ref: 'saha', name: 'Test', kind: 'cafe', lat: 41, lng: 28.6 }],
      }),
      'content/venues-test.json',
      null,
    );
    expect(sql.split('\n')[0]).toBe('-- content/venues-test.json');
    expect(sql).toContain("'test', 'test/saha', 'cafe', true");
  });
});

describe('parseTestVenues', () => {
  it('fills defaults from ref, name and coordinates', () => {
    expect(
      parseTestVenues({
        venues: [{ ref: 'saha', name: 'Kafe', kind: 'cafe', lat: 41, lng: 28.6 }],
      }),
    ).toEqual([
      {
        name: 'Kafe',
        city: 'İstanbul',
        district: 'Test',
        lat: 41,
        lng: 28.6,
        source: 'test',
        sourceRef: 'test/saha',
        kind: 'cafe',
        amenity: 'cafe',
        isActive: true,
        spots: [],
      },
    ]);
  });

  it('accepts an empty list and rejects bad entries', () => {
    expect(parseTestVenues({ venues: [] })).toEqual([]);
    expect(() =>
      parseTestVenues({ venues: [{ ref: 'a', name: 'K', kind: 'cafe', lat: 91, lng: 28 }] }),
    ).toThrow();
    expect(() =>
      parseTestVenues({ venues: [{ name: 'K', kind: 'cafe', lat: 41, lng: 28 }] }),
    ).toThrow();
    const twice = { ref: 'a', name: 'K', kind: 'cafe', lat: 41, lng: 28 };
    expect(() => parseTestVenues({ venues: [twice, twice] })).toThrow();
  });

  it('needs kind cafe (docs/SPEC_V3.md §18.1)', () => {
    const base = { ref: 'a', name: 'K', lat: 41, lng: 28 };
    expect(() => parseTestVenues({ venues: [base] })).toThrow(/kind is required/);
    expect(() => parseTestVenues({ venues: [{ ...base, kind: 'bar' }] })).toThrow(
      /kind is required/,
    );
    expect(() => parseTestVenues({ venues: [{ ...base, kind: 'campus' }] })).toThrow(
      /kind must be cafe/,
    );
  });
});

describe('content validation', () => {
  it('rejects malformed alias lists', () => {
    expect(() => parseAliasWords({ adjectives: ['Mor'], nouns: [''] })).toThrow();
  });

  it('accepts nouns up to 12 letters and rejects longer ones', () => {
    // 12 letters, counted as letters (ğ, ı, ş are one each), not bytes.
    expect(parseAliasWords({ adjectives: ['Mor'], nouns: ['Karğaşalıkçı'] }).nouns).toEqual([
      'Karğaşalıkçı',
    ]);
    expect(() => parseAliasWords({ adjectives: ['Mor'], nouns: ['Kuyrukluyıldız'] })).toThrow(
      /longer than 12/,
    );
  });

  it('rejects a word repeated within a list or across the two', () => {
    expect(() => parseAliasWords({ adjectives: ['Mor', 'Mor'], nouns: ['Kedi'] })).toThrow(
      /repeated: Mor/,
    );
    expect(() => parseAliasWords({ adjectives: ['Mor'], nouns: ['Kedi', 'kedi'] })).toThrow(
      /repeated/,
    );
    expect(() => parseAliasWords({ adjectives: ['Mavi'], nouns: ['Kedi', 'MAVİ'] })).toThrow(
      /repeated: MAVİ/,
    );
  });

  it('rejects invalid venues and duplicates', () => {
    const file = { attribution: 'a', source: 's', fetchedAt: 't' };
    expect(() => parseVenuesFile({ ...file, venues: [{ ...venue, lat: 91 }] })).toThrow();
    expect(() => parseVenuesFile({ ...file, venues: [venue, venue] })).toThrow();
    expect(parseVenuesFile({ ...file, venues: [venue] }).venues).toHaveLength(1);
  });
});

describe('cardsSql', () => {
  it('upserts both decks and retires cards missing from the JSON', () => {
    const sql = cardsSql(
      [{ word: 'Deniz', forbidden: ['dalga', 'kum', 'mavi', 'tuz', 'yüzmek'] }],
      [{ theme: 'derin', prompt: 'Seni ne mutlu eder?' }],
    );
    expect(sql).toContain('update public.cards set is_active = false;');
    expect(sql).toContain(
      "('tabu', 'Deniz', 'Deniz', array['dalga', 'kum', 'mavi', 'tuz', 'yüzmek']::text[], null, null)",
    );
    expect(sql).toContain(
      "('sohbet', 'Seni ne mutlu eder?', null, null, 'derin', 'Seni ne mutlu eder?')",
    );
    expect(sql).toContain('on conflict (deck, source_key) do update');
  });
});

describe('test venue spots', () => {
  const withSpots = {
    ref: 'saha',
    name: 'Kafe',
    kind: 'cafe',
    lat: 41,
    lng: 28.6,
    spots: [
      { ref: 'ic-salon', name: 'İç salon' },
      { ref: 'bahce', name: 'Bahçe' },
    ],
  };

  it('reads optional spots, none by default', () => {
    const [venue] = parseTestVenues({ venues: [withSpots] });
    expect(venue?.spots.map((s) => [s.ref, s.isActive])).toEqual([
      ['ic-salon', true],
      ['bahce', true],
    ]);
    expect(
      parseTestVenues({ venues: [{ ref: 'a', name: 'K', kind: 'cafe', lat: 41, lng: 28 }] })[0]
        ?.spots,
    ).toEqual([]);
  });

  it('refuses duplicate or malformed spot refs', () => {
    const twice = { ref: 'bahce', name: 'Bahçe' };
    expect(() => parseTestVenues({ venues: [{ ...withSpots, spots: [twice, twice] }] })).toThrow(
      /duplicate/,
    );
    expect(() =>
      parseTestVenues({ venues: [{ ...withSpots, spots: [{ ref: 'İç', name: 'İç' }] }] }),
    ).toThrow();
  });

  it('upserts the spots of test venues that have them, by the test source reference', () => {
    const sql = testSpotsSql(
      parseTestVenues({
        venues: [withSpots, { ref: 'bos', name: 'Boş', kind: 'cafe', lat: 41, lng: 28 }],
      }),
    );
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain("('ic-salon', 'İç salon', 0, true)");
    expect(sql[0]).toContain("('bahce', 'Bahçe', 1, true)");
    expect(sql[0]).toContain("where v.source = 'test' and v.source_ref = 'test/saha'");
    expect(sql[0]).toContain('on conflict (venue_id, ref) do update');
  });
});
