// MVP_SPEC §6. Tests first (CLAUDE.md).
import { describe, expect, it } from 'vitest';

import { containsForbidden, isCorrectGuess, normalize, tokenize } from './trText.ts';

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

describe('containsForbidden', () => {
  const card = ['deniz', 'dalga', 'kum'];

  it.each(['denizde', 'Denize', 'DENİZ', "deniz'de", 'd e n i z'])(
    'catches "%s" for the root "deniz"',
    (clue) => {
      expect(containsForbidden(`bunu düşün: ${clue}`, card)).toBe(true);
    },
  );

  it('folds Turkish letters on both sides', () => {
    expect(containsForbidden('Ilık bir gün', ['ılık'])).toBe(true);
    expect(containsForbidden('ılık', ['Ilık'])).toBe(true);
    expect(containsForbidden('istanbulda', ['İstanbul'])).toBe(true);
    expect(containsForbidden('İstanbul', ['istanbul'])).toBe(true);
    expect(containsForbidden('ogretmenler', ['öğretmen'])).toBe(true);
    expect(containsForbidden('öğretmen', ['ogretmen'])).toBe(true);
  });

  it('matches short roots (under 4 letters) only as whole words', () => {
    expect(containsForbidden('kar yağıyor', ['kar'])).toBe(true);
    expect(containsForbidden('kara bulut', ['kar'])).toBe(false);
    // Known trade-off (§6): suffixed short roots slip through.
    expect(containsForbidden('karda yürüdük', ['kar'])).toBe(false);
  });

  it('catches multi-word targets written as one run of letters', () => {
    expect(containsForbidden('d i ş f ı r ç a s ı', ['Diş fırçası'])).toBe(true);
    expect(containsForbidden('dişfırçası', ['Diş fırçası'])).toBe(true);
    expect(containsForbidden('fırçası yeni', ['Diş fırçası'])).toBe(true);
  });

  it('passes clean clues', () => {
    expect(containsForbidden('mavi ve tuzlu su', card)).toBe(false);
  });
});

describe('isCorrectGuess', () => {
  it('accepts the target after normalization', () => {
    expect(isCorrectGuess('DENİZ', 'deniz')).toBe(true);
    expect(isCorrectGuess('  deniz ', 'Deniz')).toBe(true);
    expect(isCorrectGuess('ılık', 'Ilık')).toBe(true);
    expect(isCorrectGuess('istanbul', 'İstanbul')).toBe(true);
    expect(isCorrectGuess('ogretmen', 'öğretmen')).toBe(true);
    expect(isCorrectGuess('d e n i z', 'deniz')).toBe(true);
  });

  it('accepts up to 4 extra letters after the target', () => {
    expect(isCorrectGuess('denizde', 'deniz')).toBe(true);
    expect(isCorrectGuess('denizlere', 'deniz')).toBe(true); // +4
    expect(isCorrectGuess('denizlerde', 'deniz')).toBe(false); // +5
  });

  it('rejects other words', () => {
    expect(isCorrectGuess('göl', 'deniz')).toBe(false);
    expect(isCorrectGuess('den', 'deniz')).toBe(false);
    expect(isCorrectGuess('', 'deniz')).toBe(false);
  });
});
