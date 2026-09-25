import { describe, expect, it } from 'vitest';

import { parseAliasWords, parseTestVenues, parseVenuesFile } from './content.ts';
import { aliasWordsSql, cardsSql, venuesSql } from './sections.ts';

const venue = {
  name: "Ayşe'nin Kafesi",
  city: 'İstanbul',
  district: 'Beylikdüzü',
  lat: 41.0,
  lng: 28.64,
  source: 'osm',
  sourceRef: 'node/1',
  amenity: 'cafe',
  isActive: true,
};

describe('aliasWordsSql', () => {
  it('replaces the word list', () => {
    const sql = aliasWordsSql({ adjectives: ['Mor'], animals: ['Baykuş'] });
    expect(sql).toContain('delete from public.alias_words;');
    expect(sql).toContain("('adjective', 'Mor')");
    expect(sql).toContain("('animal', 'Baykuş')");
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
      parseTestVenues({ venues: [{ ref: 'saha', name: 'Test', lat: 41, lng: 28.6 }] }),
      'content/venues-test.json',
      null,
    );
    expect(sql.split('\n')[0]).toBe('-- content/venues-test.json');
    expect(sql).toContain("'test', 'test/saha', true");
  });
});

describe('parseTestVenues', () => {
  it('fills defaults from ref, name and coordinates', () => {
    expect(
      parseTestVenues({ venues: [{ ref: 'saha', name: 'Kafe', lat: 41, lng: 28.6 }] }),
    ).toEqual([
      {
        name: 'Kafe',
        city: 'İstanbul',
        district: 'Test',
        lat: 41,
        lng: 28.6,
        source: 'test',
        sourceRef: 'test/saha',
        amenity: 'cafe',
        isActive: true,
      },
    ]);
  });

  it('accepts an empty list and rejects bad entries', () => {
    expect(parseTestVenues({ venues: [] })).toEqual([]);
    expect(() =>
      parseTestVenues({ venues: [{ ref: 'a', name: 'K', lat: 91, lng: 28 }] }),
    ).toThrow();
    expect(() => parseTestVenues({ venues: [{ name: 'K', lat: 41, lng: 28 }] })).toThrow();
    const twice = { ref: 'a', name: 'K', lat: 41, lng: 28 };
    expect(() => parseTestVenues({ venues: [twice, twice] })).toThrow();
  });
});

describe('content validation', () => {
  it('rejects malformed alias lists', () => {
    expect(() => parseAliasWords({ adjectives: ['Mor'], animals: [''] })).toThrow();
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
