import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  parseProfanity,
  parseSahtekarWords,
  SAHTEKAR_MIN_PER_CATEGORY,
  SAHTEKAR_MIN_WORDS,
} from './content.ts';
import { cardsSql } from './sections.ts';

const profanity = parseProfanity(
  JSON.parse(readFileSync(new URL('../../content/profanity-tr.json', import.meta.url), 'utf8')),
);
const words = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix} ${i}`);
const many = (categories: number, per: number) => ({
  categories: Array.from({ length: categories }, (_, i) => ({
    key: `k${i}`,
    name: `Kategori ${i}`,
    words: words(per, `kelime${i}`),
  })),
});

describe('content/sahtekar-words.json (docs/SPEC_V3.md §20.2)', () => {
  it('holds at least 500 words, at least 12 per category, none twice', () => {
    const json = JSON.parse(
      readFileSync(new URL('../../content/sahtekar-words.json', import.meta.url), 'utf8'),
    );
    const categories = parseSahtekarWords(json, profanity);
    const total = categories.reduce((n, c) => n + c.words.length, 0);
    expect(total).toBeGreaterThanOrEqual(SAHTEKAR_MIN_WORDS);
    for (const c of categories) expect(c.words.length).toBeGreaterThanOrEqual(12);
  });

  it('refuses too few words, a short category, a repeat, a bad key and a listed word', () => {
    expect(() => parseSahtekarWords(many(10, 40), profanity)).toThrow('at least 500');
    expect(() =>
      parseSahtekarWords(
        {
          categories: [
            ...many(30, 20).categories,
            { key: 'az', name: 'Az', words: words(5, 'az') },
          ],
        },
        profanity,
      ),
    ).toThrow(`at least ${SAHTEKAR_MIN_PER_CATEGORY}`);
    const repeat = many(30, 20);
    repeat.categories[1]?.words.push('KELİME0 3');
    expect(() => parseSahtekarWords(repeat, profanity)).toThrow('already in k0');
    const key = many(30, 20);
    (key.categories[0] as { key: string }).key = 'Büyük';
    expect(() => parseSahtekarWords(key, profanity)).toThrow('key is invalid');
    const listed = many(30, 20);
    listed.categories[0]?.words.push(profanity.wholeWords[0] ?? profanity.terms[0] ?? '');
    expect(() => parseSahtekarWords(listed, profanity)).toThrow('profanity list');
  });

  it('seeds one card per word: theme is the category key, prompt its name', () => {
    const sql = cardsSql([], [], [{ key: 'tatli', name: 'Tatlı', words: ['Baklava'] }]);
    expect(sql).toContain(`('sahtekar', 'tatli/Baklava', 'Baklava', null, 'tatli', 'Tatlı')`);
  });
});
