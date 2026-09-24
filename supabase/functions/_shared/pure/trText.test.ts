// MVP_SPEC §6. Tests first (CLAUDE.md). M4 covers normalize; tokenize, containsForbidden and
// isCorrectGuess arrive with M5.
import { describe, expect, it } from 'vitest';

import { normalize } from './trText.ts';

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

  it('keeps letters of other alphabets as letters', () => {
    expect(normalize('Café')).toBe('café');
  });
});
