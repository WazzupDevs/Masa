// Types and validation for content/*.json. Invalid content fails `pnpm seed` loudly.
import type { AliasWords } from '../../supabase/functions/_shared/pure/alias.ts';
import { type LngLat, validateRing } from '../../supabase/functions/_shared/pure/geo.ts';
import { SOHBET_THEMES, type SohbetTheme } from '../../supabase/functions/_shared/pure/sohbet.ts';

export type VenueRecord = {
  name: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  source: string;
  sourceRef: string;
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

export function parseAliasWords(json: unknown): AliasWords {
  if (!isRecord(json)) throw new Error('aliases-tr.json must be an object');
  return {
    adjectives: stringList(json.adjectives, 'adjectives'),
    nouns: stringList(json.nouns, 'nouns'),
  };
}

function parseVenue(value: unknown, index: number): VenueRecord {
  const where = `venues[${index}]`;
  if (!isRecord(value)) throw new Error(`${where} must be an object`);
  const { name, city, district, lat, lng, source, sourceRef, amenity, isActive } = value;
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
// `lat` and `lng` are required; an empty list (or no file) adds nothing to the seed.
export function parseTestVenues(json: unknown): VenueRecord[] {
  if (!isRecord(json) || !Array.isArray(json.venues)) {
    throw new Error('venues-test.json must have a venues list');
  }
  const venues = json.venues.map((value: unknown, i: number) => {
    const where = `venues-test.json venues[${i}]`;
    if (!isRecord(value)) throw new Error(`${where} must be an object`);
    const { ref, name, city = 'İstanbul', district = 'Test', isActive = true } = value;
    return parseVenue(
      {
        name,
        city,
        district,
        lat: value.lat,
        lng: value.lng,
        source: 'test',
        sourceRef: typeof ref === 'string' ? `test/${ref}` : ref,
        amenity: 'cafe',
        isActive,
      },
      i,
    );
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
// coordinates. `ref`s are permanent: a removed spot is set `isActive: false`, never deleted.
export type CampusSpot = { ref: string; name: string; isActive: boolean };
export type CampusVenue = {
  ref: string;
  name: string;
  city: string;
  district: string;
  isActive: boolean;
  boundary: LngLat[];
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

export function parseCampusVenues(json: unknown): CampusVenue[] {
  if (!isRecord(json) || !Array.isArray(json.venues)) {
    throw new Error('venues-campus.json must have a venues list');
  }
  const venues = json.venues.map((value: unknown, i: number): CampusVenue => {
    const where = `venues-campus.json venues[${i}]`;
    if (!isRecord(value)) throw new Error(`${where} must be an object`);
    const { ref, name, city, district, isActive = true, boundary, spots } = value;
    if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) {
      throw new Error(`${where}.ref must be 1–40 of a-z, 0-9 and -`);
    }
    for (const [field, v] of Object.entries({ name, city, district })) {
      if (typeof v !== 'string' || v.trim() === '')
        throw new Error(`${where}.${field} is required`);
    }
    if (typeof isActive !== 'boolean') throw new Error(`${where}.isActive must be a boolean`);
    if (!Array.isArray(boundary)) throw new Error(`${where}.boundary must be a list`);
    const problem = validateRing(boundary);
    if (problem) throw new Error(`${where}.boundary: ${problem}`);
    if (!Array.isArray(spots) || spots.length === 0) {
      throw new Error(`${where}.spots must list at least one spot`);
    }
    const parsed = spots.map((s: unknown, j: number) => parseSpot(s, `${where}.spots[${j}]`));
    if (new Set(parsed.map((s) => s.ref)).size !== parsed.length) {
      throw new Error(`${where}.spots has duplicate refs`);
    }
    return {
      ref,
      name: name as string,
      city: city as string,
      district: district as string,
      isActive,
      boundary: boundary as LngLat[],
      spots: parsed,
    };
  });
  if (new Set(venues.map((v) => v.ref)).size !== venues.length) {
    throw new Error('venues-campus.json has duplicate refs');
  }
  return venues;
}
