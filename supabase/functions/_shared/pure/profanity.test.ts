import { describe, expect, it } from 'vitest';

import { containsProfanity, prepareTerms } from './profanity.ts';

const terms = prepareTerms(['orospu', 'siktir', 'göt', 'amk', 'piç kurusu', 'şerefsiz']);

describe('containsProfanity', () => {
  it('finds listed words regardless of case, Turkish letters and punctuation', () => {
    expect(containsProfanity('OROSPU', terms)).toBe(true);
    expect(containsProfanity('siktir git', terms)).toBe(true);
    expect(containsProfanity('Şerefsiz!', terms)).toBe(true);
    expect(containsProfanity('serefsiz', terms)).toBe(true);
    expect(containsProfanity('amk.', terms)).toBe(true);
  });

  it('finds suffixed forms of words with 5 or more letters', () => {
    expect(containsProfanity('orospular', terms)).toBe(true);
    expect(containsProfanity("şerefsiz'in", terms)).toBe(true);
  });

  it('matches short words only as whole words', () => {
    expect(containsProfanity('göt', terms)).toBe(true);
    expect(containsProfanity('götürdüm', terms)).toBe(false);
    expect(containsProfanity('amkara', terms)).toBe(false);
  });

  it('matches phrases on word boundaries', () => {
    expect(containsProfanity('seni piç kurusu', terms)).toBe(true);
    expect(containsProfanity('piç', terms)).toBe(false);
  });

  it('passes clean text', () => {
    expect(containsProfanity('Merhaba, nasılsınız?', terms)).toBe(false);
    expect(containsProfanity('', terms)).toBe(false);
  });
});
