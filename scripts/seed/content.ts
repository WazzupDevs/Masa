// Types and validation for content/*.json. Invalid content fails `pnpm seed` loudly.
import type { AliasWords } from '../../supabase/functions/_shared/pure/alias.ts';
import {
  insideRing,
  type LngLat,
  type Point,
  validateRing,
} from '../../supabase/functions/_shared/pure/geo.ts';
import { SOHBET_THEMES, type SohbetTheme } from '../../supabase/functions/_shared/pure/sohbet.ts';
import { isVenueKind, type VenueKind } from '../../supabase/functions/_shared/pure/venueKind.ts';

export type VenueRecord = {
  name: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  source: string;
  sourceRef: string;
  // Required in every venue file (pure/venueKind.ts); each file allows one kind.
  kind: VenueKind;
  amenity: string;
  isActive: boolean;
};

export type VenuesFile = {
  attribution: string;
  source: string;
  fetchedAt: string;
  venues: VenueRecord[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.trim() !== '')) {
    throw new Error(`${field} must be a list of non-empty strings`);
  }
  return value;
}

// `terms` match with suffixes from 5 letters on; `wholeWords` only as whole words.
export type ProfanityList = { terms: string[]; wholeWords: string[] };

export function parseProfanity(json: unknown): ProfanityList {
  if (!isRecord(json)) throw new Error('profanity-tr.json must be an object');
  return {
    terms: stringList(json.terms, 'terms'),
    wholeWords: stringList(json.wholeWords, 'wholeWords'),
  };
}

// A noun's longest form: "Sıfat İsim" must fit the alias line (docs/SPEC_V3.md §5.6).
export const MAX_ALIAS_NOUN_LENGTH = 12;

function aliasKey(word: string): string {
  return word.trim().toLocaleLowerCase('tr-TR');
}

export function parseAliasWords(json: unknown): AliasWords {
  if (!isRecord(json)) throw new Error('aliases-tr.json must be an object');
  const adjectives = stringList(json.adjectives, 'adjectives');
  const nouns = stringList(json.nouns, 'nouns');
  const long = nouns.filter((w) => [...w.trim()].length > MAX_ALIAS_NOUN_LENGTH);
  if (long.length > 0) {
    throw new Error(`nouns longer than ${MAX_ALIAS_NOUN_LENGTH} letters: ${long.join(', ')}`);
  }
  // No word twice, within a list or across the two.
  const seen = new Set<string>();
  for (const word of [...adjectives, ...nouns]) {
    const key = aliasKey(word);
    if (seen.has(key)) throw new Error(`alias word repeated: ${word}`);
    seen.add(key);
  }
  return { adjectives, nouns };
}

// venues-pilot.json and venues-test.json hold cafes; venues-campus.json campuses.
function parseKind(value: unknown, allowed: VenueKind, where: string): VenueKind {
  if (!isVenueKind(value)) throw new Error(`${where}.kind is required (cafe or campus)`);
  if (value !== allowed) throw new Error(`${where}.kind must be ${allowed} in this file`);
  return value;
}

function parseVenue(value: unknown, index: number): VenueRecord {
  const where = `venues[${index}]`;
  if (!isRecord(value)) throw new Error(`${where} must be an object`);
  const { name, city, district, lat, lng, source, sourceRef, amenity, isActive } = value;
  parseKind(value.kind, 'cafe', where);
  for (const [field, v] of Object.entries({ name, city, district, source, sourceRef, amenity })) {
    if (typeof v !== 'string' || v.trim() === '') throw new Error(`${where}.${field} is required`);
  }
  if (typeof lat !== 'number' || lat < -90 || lat > 90) throw new Error(`${where}.lat is invalid`);
  if (typeof lng !== 'number' || lng < -180 || lng > 180) {
    throw new Error(`${where}.lng is invalid`);
  }
  if (typeof isActive !== 'boolean') throw new Error(`${where}.isActive must be a boolean`);
  return value as VenueRecord;
}

export function parseVenuesFile(json: unknown): VenuesFile {
  if (!isRecord(json) || !Array.isArray(json.venues)) {
    throw new Error('venues-pilot.json must have a venues list');
  }
  const { attribution, source, fetchedAt } = json;
  if (typeof attribution !== 'string' || typeof source !== 'string') {
    throw new Error('venues-pilot.json needs attribution and source');
  }
  if (typeof fetchedAt !== 'string') throw new Error('venues-pilot.json needs fetchedAt');
  const venues = json.venues.map(parseVenue);
  const refs = new Set(venues.map((v) => `${v.source}:${v.sourceRef}`));
  if (refs.size !== venues.length) throw new Error('venues-pilot.json has duplicate sourceRefs');
  return { attribution, source, fetchedAt, venues };
}

// content/venues-test.json: hand-entered venues for field tests (source 'test'). Only `ref`, `name`,
// `lat` and `lng` are required; an empty list (or no file) adds nothing to the seed. Optional
// `spots` as in venues-campus.json, for trying spots on a device (the venue keeps its 300 m radius).
export type TestVenue = VenueRecord & { spots: CampusSpot[] };

export function parseTestVenues(json: unknown): TestVenue[] {
  if (!isRecord(json) || !Array.isArray(json.venues)) {
    throw new Error('venues-test.json must have a venues list');
  }
  const venues = json.venues.map((value: unknown, i: number) => {
    const where = `venues-test.json venues[${i}]`;
    if (!isRecord(value)) throw new Error(`${where} must be an object`);
    const { ref, name, city = 'İstanbul', district = 'Test', isActive = true, spots = [] } = value;
    const venue = parseVenue(
      {
        name,
        city,
        district,
        lat: value.lat,
        lng: value.lng,
        source: 'test',
        sourceRef: typeof ref === 'string' ? `test/${ref}` : ref,
        kind: value.kind,
        amenity: 'cafe',
        isActive,
      },
      i,
    );
    return { ...venue, spots: parseSpots(spots, `${where}.spots`) };
  });
  if (new Set(venues.map((v) => v.sourceRef)).size !== venues.length) {
    throw new Error('venues-test.json has duplicate refs');
  }
  return venues;
}

export type TabuCard = { word: string; forbidden: string[] };
export type SohbetCard = { theme: SohbetTheme; prompt: string };

export function parseTabuCards(json: unknown): TabuCard[] {
  if (!isRecord(json) || !Array.isArray(json.cards)) throw new Error('tabu-cards.json needs cards');
  return json.cards.map((card, i) => {
    if (!isRecord(card) || typeof card.word !== 'string' || card.word.trim() === '') {
      throw new Error(`tabu cards[${i}].word is required`);
    }
    return { word: card.word, forbidden: stringList(card.forbidden, `tabu cards[${i}].forbidden`) };
  });
}

export function parseSohbetCards(json: unknown): SohbetCard[] {
  if (!isRecord(json) || !Array.isArray(json.cards))
    throw new Error('sohbet-cards.json needs cards');
  return json.cards.map((card, i) => {
    if (!isRecord(card) || typeof card.prompt !== 'string' || card.prompt.trim() === '') {
      throw new Error(`sohbet cards[${i}].prompt is required`);
    }
    if (!(SOHBET_THEMES as readonly unknown[]).includes(card.theme)) {
      throw new Error(`sohbet cards[${i}].theme is invalid`);
    }
    return { theme: card.theme as SohbetTheme, prompt: card.prompt };
  });
}

// content/venues-campus.json (docs/SPEC_V3.md §4.1): venues with a boundary and spots. The
// boundary is a GeoJSON outer ring ([lng, lat], closed, counterclockwise); spots have no
// coordinates. `ref`s are permanent: a removed spot is set `isActive: false`, never deleted. A
// venue may have no active spot (check-in then asks for none). `location` ({ lat, lng }, inside the
// boundary) is the venue's point on the map; without it, a point on the boundary's surface.
export type CampusSpot = { ref: string; name: string; isActive: boolean };
export type CampusVenue = {
  ref: string;
  name: string;
  city: string;
  district: string;
  kind: 'campus';
  isActive: boolean;
  boundary: LngLat[];
  location: Point | null;
  spots: CampusSpot[];
};

export const REF_PATTERN = /^[a-z0-9-]{1,40}$/;
export const SPOT_NAME_MAX = 40;

function parseSpot(value: unknown, where: string): CampusSpot {
  if (!isRecord(value)) throw new Error(`${where} must be an object`);
  const { ref, name, isActive = true } = value;
  if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) {
    throw new Error(`${where}.ref must be 1–40 of a-z, 0-9 and -`);
  }
  if (typeof name !== 'string' || name.trim() === '' || name.length > SPOT_NAME_MAX) {
    throw new Error(`${where}.name must be 1–${SPOT_NAME_MAX} characters`);
  }
  if (typeof isActive !== 'boolean') throw new Error(`${where}.isActive must be a boolean`);
  return { ref, name, isActive };
}

// A spot list: well-formed, unique refs.
function parseSpots(value: unknown, where: string): CampusSpot[] {
  if (!Array.isArray(value)) throw new Error(`${where} must be a list`);
  const spots = value.map((s: unknown, j: number) => parseSpot(s, `${where}[${j}]`));
  if (new Set(spots.map((s) => s.ref)).size !== spots.length) {
    throw new Error(`${where} has duplicate refs`);
  }
  return spots;
}

export function parseCampusVenues(json: unknown): CampusVenue[] {
  if (!isRecord(json) || !Array.isArray(json.venues)) {
    throw new Error('venues-campus.json must have a venues list');
  }
  const venues = json.venues.map((value: unknown, i: number): CampusVenue => {
    const where = `venues-campus.json venues[${i}]`;
    if (!isRecord(value)) throw new Error(`${where} must be an object`);
    const { ref, name, city, district, isActive = true, boundary, location, spots } = value;
    if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) {
      throw new Error(`${where}.ref must be 1–40 of a-z, 0-9 and -`);
    }
    for (const [field, v] of Object.entries({ name, city, district })) {
      if (typeof v !== 'string' || v.trim() === '')
        throw new Error(`${where}.${field} is required`);
    }
    if (typeof isActive !== 'boolean') throw new Error(`${where}.isActive must be a boolean`);
    parseKind(value.kind, 'campus', where);
    if (!Array.isArray(boundary)) throw new Error(`${where}.boundary must be a list`);
    const problem = validateRing(boundary);
    if (problem) throw new Error(`${where}.boundary: ${problem}`);
    const parsed = parseSpots(spots ?? [], `${where}.spots`);
    let point: Point | null = null;
    if (location !== undefined) {
      if (
        !isRecord(location) ||
        typeof location.lat !== 'number' ||
        typeof location.lng !== 'number' ||
        Math.abs(location.lat) > 90 ||
        Math.abs(location.lng) > 180
      ) {
        throw new Error(`${where}.location must be { lat, lng }`);
      }
      point = { lat: location.lat, lng: location.lng };
      if (!insideRing(point, boundary as LngLat[])) {
        throw new Error(`${where}.location is outside the boundary`);
      }
    }
    return {
      ref,
      name: name as string,
      city: city as string,
      district: district as string,
      kind: 'campus',
      isActive,
      boundary: boundary as LngLat[],
      location: point,
      spots: parsed,
    };
  });
  if (new Set(venues.map((v) => v.ref)).size !== venues.length) {
    throw new Error('venues-campus.json has duplicate refs');
  }
  return venues;
}
