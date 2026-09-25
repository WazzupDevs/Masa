// Profile fields (docs/SPEC_V2.md §5.1). The same rules run on the phone (length) and in the
// profile function (length and profanity).
import { containsProfanity, type PreparedTerms } from './profanity.ts';

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;
export const BIO_MAX = 160;
export const PARTICIPATIONS = ['anonymous', 'profile'] as const;
export type Participation = (typeof PARTICIPATIONS)[number];

export type FieldCheck =
  { ok: true; value: string | null } | { ok: false; reason: 'length' | 'profanity' };

const length = (s: string) => [...s].length;

// Trimmed display name with inner whitespace collapsed; required (2–24 characters).
export function checkDisplayName(raw: string, terms: PreparedTerms): FieldCheck {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (length(value) < DISPLAY_NAME_MIN || length(value) > DISPLAY_NAME_MAX) {
    return { ok: false, reason: 'length' };
  }
  if (containsProfanity(value, terms)) return { ok: false, reason: 'profanity' };
  return { ok: true, value };
}

// Trimmed bio; empty clears it (null), otherwise at most 160 characters.
export function checkBio(raw: string, terms: PreparedTerms): FieldCheck {
  const value = raw.trim();
  if (value === '') return { ok: true, value: null };
  if (length(value) > BIO_MAX) return { ok: false, reason: 'length' };
  if (containsProfanity(value, terms)) return { ok: false, reason: 'profanity' };
  return { ok: true, value };
}

// Profile photos: {public_id}/{uuid}.jpg in the private profile-photos bucket, at most 300 KB.
export const PHOTO_BUCKET = 'profile-photos';
export const PHOTO_MAX_BYTES = 300 * 1024;
export const PHOTO_SIZE_PX = 512;
export const PHOTO_JPEG_QUALITY = 0.7;
export const PHOTO_URL_SECONDS = 3600;

const PHOTO_PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.jpg$/;

export function isOwnPhotoPath(path: string, publicId: string): boolean {
  const match = PHOTO_PATH.exec(path);
  return match !== null && match[1] === publicId;
}
