import { describe, expect, it } from 'vitest';

import { prepareTerms } from './profanity.ts';
import { checkBio, checkDisplayName, isOwnPhotoPath } from './profile.ts';

const terms = prepareTerms(['siktir', 'göt']);

describe('checkDisplayName', () => {
  it('trims and collapses spaces, 2–24 characters', () => {
    expect(checkDisplayName('  Ayşe   Nur ', terms)).toEqual({ ok: true, value: 'Ayşe Nur' });
    expect(checkDisplayName('A', terms)).toEqual({ ok: false, reason: 'length' });
    expect(checkDisplayName('ş'.repeat(25), terms)).toEqual({ ok: false, reason: 'length' });
    expect(checkDisplayName('ş'.repeat(24), terms).ok).toBe(true);
  });

  it('rejects profanity', () => {
    expect(checkDisplayName('Siktir Ali', terms)).toEqual({ ok: false, reason: 'profanity' });
  });
});

describe('checkBio', () => {
  it('clears on empty and allows up to 160 characters', () => {
    expect(checkBio('   ', terms)).toEqual({ ok: true, value: null });
    expect(checkBio('Kahve ve Tabu ', terms)).toEqual({ ok: true, value: 'Kahve ve Tabu' });
    expect(checkBio('a'.repeat(161), terms)).toEqual({ ok: false, reason: 'length' });
  });

  it('rejects profanity but not everyday words', () => {
    expect(checkBio('göt', terms)).toEqual({ ok: false, reason: 'profanity' });
    expect(checkBio('çok şık bir kafe', terms).ok).toBe(true);
  });
});

describe('isOwnPhotoPath', () => {
  const me = '11111111-1111-4111-8111-111111111111';
  it('accepts only {public_id}/{uuid}.jpg of the caller', () => {
    expect(isOwnPhotoPath(`${me}/22222222-2222-4222-8222-222222222222.jpg`, me)).toBe(true);
    expect(isOwnPhotoPath(`33333333-3333-4333-8333-333333333333/x.jpg`, me)).toBe(false);
    expect(isOwnPhotoPath(`${me}/../other.jpg`, me)).toBe(false);
    expect(isOwnPhotoPath(`${me}/22222222-2222-4222-8222-222222222222.png`, me)).toBe(false);
  });
});
