import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  HARF_MIN_CATEGORIES,
  parseHarfCategories,
  parseProfanity,
  parseSarkiWords,
  SARKI_MIN_WORDS,
} from './content.ts';
import { cardsSql } from './sections.ts';

const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const profanity = parseProfanity(read('content/profanity-tr.json'));
const categories = (n: number) => ({
  categories: Array.from({ length: n }, (_, i) => ({ key: `k${i}`, name: `Kategori ${i}` })),
});
const words = (n: number) => ({
  words: Array.from({ length: n }, (_, i) => ({ key: `w${i}`, word: `kelime${i}` })),
});

describe('content/harf-categories.json (docs/SPEC_V3.md §20.3)', () => {
  it('holds at least 150 categories', () => {
    expect(
      parseHarfCategories(read('content/harf-categories.json'), profanity).length,
    ).toBeGreaterThanOrEqual(HARF_MIN_CATEGORIES);
  });

  it('refuses too few, a repeated name, a bad key and a listed word', () => {
    expect(() => parseHarfCategories(categories(20), profanity)).toThrow('at least 150');
    const repeat = categories(160);
    repeat.categories.push({ key: 'tekrar', name: 'KATEGORİ 3' });
    expect(() => parseHarfCategories(repeat, profanity)).toThrow('twice');
    const key = categories(160);
    (key.categories[0] as { key: string }).key = 'Büyük';
    expect(() => parseHarfCategories(key, profanity)).toThrow('key is invalid');
    const listed = categories(160);
    listed.categories.push({
      key: 'kotu',
      name: profanity.wholeWords[0] ?? profanity.terms[0] ?? '',
    });
    expect(() => parseHarfCategories(listed, profanity)).toThrow('profanity list');
  });
});

describe('content/sarki-words.json (docs/SPEC_V3.md §20.4)', () => {
  it('holds at least 400 single words', () => {
    expect(
      parseSarkiWords(read('content/sarki-words.json'), profanity).length,
    ).toBeGreaterThanOrEqual(SARKI_MIN_WORDS);
  });

  it('refuses too few, two words in one, a repeat and a listed word', () => {
    expect(() => parseSarkiWords(words(50), profanity)).toThrow('at least 400');
    const two = words(410);
    two.words.push({ key: 'iki', word: 'iki kelime' });
    expect(() => parseSarkiWords(two, profanity)).toThrow('one word');
    const repeat = words(410);
    repeat.words.push({ key: 'tekrar', word: 'KELİME3' });
    expect(() => parseSarkiWords(repeat, profanity)).toThrow('twice');
    const listed = words(410);
    listed.words.push({ key: 'kotu', word: profanity.wholeWords[0] ?? profanity.terms[0] ?? '' });
    expect(() => parseSarkiWords(listed, profanity)).toThrow('profanity list');
  });
});

describe('the say decks in the seed', () => {
  it('seeds a Harf category as theme and prompt, and a Şarkı word as word', () => {
    const sql = cardsSql(
      [],
      [],
      [],
      [{ key: 'meyve', name: 'Meyve' }],
      [{ key: 'ask', word: 'aşk' }],
    );
    expect(sql).toContain(`('harf', 'meyve', null, null, 'meyve', 'Meyve')`);
    expect(sql).toContain(`('sarki', 'ask', 'aşk', null, null, null)`);
    expect(sql).toContain('content/harf-categories.json, content/sarki-words.json');
  });
});
