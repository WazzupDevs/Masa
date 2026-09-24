import { describe, expect, it } from 'vitest';

import { containsProfanity, prepareTerms } from './profanity.ts';

const terms = prepareTerms(
  ['orospu', 'siktir', 'sik', 'göt', 'amk', 'piç kurusu', 'şerefsiz', 'serefsiz'],
  ['ananı'],
);

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

  it('does not fold Turkish letters: only listed spellings match', () => {
    expect(containsProfanity('GÖT', terms)).toBe(true);
    expect(containsProfanity('got it', terms)).toBe(false);
    expect(containsProfanity('piç kurusu', terms)).toBe(true);
    expect(containsProfanity('pic kurusu', terms)).toBe(false);
  });

  it('matches short words only as whole words', () => {
    expect(containsProfanity('göt', terms)).toBe(true);
    expect(containsProfanity('götürdüm', terms)).toBe(false);
    expect(containsProfanity('amkara', terms)).toBe(false);
    expect(containsProfanity('sik', terms)).toBe(true);
    for (const word of ['şık', 'sık', 'sıkıcı', 'sıkıldım', 'SIK']) {
      expect(containsProfanity(word, terms), word).toBe(false);
    }
  });

  it('matches whole-word terms only as whole words, whatever their length', () => {
    expect(containsProfanity('ananı', terms)).toBe(true);
    expect(containsProfanity('ANANI!', terms)).toBe(true);
    expect(containsProfanity('ananın yemeği', terms)).toBe(false);
  });

  it('matches phrases on word boundaries', () => {
    expect(containsProfanity('seni piç kurusu', terms)).toBe(true);
    expect(containsProfanity('piç', terms)).toBe(false);
  });

  it('sees through spaced-out letters', () => {
    expect(containsProfanity('o r o s p u', terms)).toBe(true);
    expect(containsProfanity('a.m.k', terms)).toBe(true);
  });

  it('passes clean text', () => {
    expect(containsProfanity('Merhaba, nasılsınız?', terms)).toBe(false);
    expect(containsProfanity('', terms)).toBe(false);
  });
});
