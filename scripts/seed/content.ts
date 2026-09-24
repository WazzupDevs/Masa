// Types and validation for content/*.json. Invalid content fails `pnpm seed` loudly.
import type { AliasWords } from '../../supabase/functions/_shared/pure/alias.ts';

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

export function parseProfanity(json: unknown): string[] {
  if (!isRecord(json)) throw new Error('profanity-tr.json must be an object');
  return stringList(json.terms, 'terms');
}

export function parseAliasWords(json: unknown): AliasWords {
  if (!isRecord(json)) throw new Error('aliases-tr.json must be an object');
  return {
    adjectives: stringList(json.adjectives, 'adjectives'),
    animals: stringList(json.animals, 'animals'),
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
