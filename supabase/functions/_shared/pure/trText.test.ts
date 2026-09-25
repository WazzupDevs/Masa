// MVP_SPEC §6. Tests first (CLAUDE.md).
import { describe, expect, it } from 'vitest';

import { normalize, tokenize } from './trText.ts';

describe('normalize', () => {
  it('lowercases with Turkish rules and folds Turkish letters', () => {
    expect(normalize('DENİZ')).toBe('deniz');
    expect(normalize('Denize')).toBe('denize');
    expect(normalize('Ilık')).toBe('ilik');
    expect(normalize('ılık')).toBe('ilik');
    expect(normalize('İstanbul')).toBe('istanbul');
    expect(normalize('istanbul')).toBe('istanbul');
    expect(normalize('öğretmen')).toBe('ogretmen');
    expect(normalize('ogretmen')).toBe('ogretmen');
    expect(normalize('ÇĞIİÖŞÜ çğıiöşü')).toBe('cgiiosu cgiiosu');
  });

  it('turns everything but letters and digits into spaces', () => {
    expect(normalize("deniz'de")).toBe('deniz de');
    expect(normalize('deniz, de!')).toBe('deniz  de ');
    expect(normalize('3-2')).toBe('3 2');
    expect(normalize('d e n i z')).toBe('d e n i z');
  });

  it('can keep Turkish letters (profanity matching)', () => {
    expect(normalize('ŞIK Sık İyi', { fold: false })).toBe('şık sık iyi');
    expect(normalize("GÖT'ü", { fold: false })).toBe('göt ü');
  });

  it('keeps letters of other alphabets as letters', () => {
    expect(normalize('Café')).toBe('café');
  });
});

describe('tokenize', () => {
  it('splits on spaces and drops empty tokens', () => {
    expect(tokenize("  Deniz'de   yüzdük ")).toEqual(['deniz', 'de', 'yuzduk']);
    expect(tokenize('')).toEqual([]);
  });

  it('can keep Turkish letters', () => {
    expect(tokenize('ş ı k olmuş', { fold: false })).toEqual(['şık', 'olmuş']);
  });

  it('joins runs of single letters', () => {
    expect(tokenize('d e n i z')).toEqual(['deniz']);
    expect(tokenize('bu d-e-n-i-z mavi')).toEqual(['bu', 'deniz', 'mavi']);
    expect(tokenize('a')).toEqual(['a']);
  });
});
