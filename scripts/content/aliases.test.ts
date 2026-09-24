// Guards content/aliases-tr.json against the rules in MVP_SPEC §11: positive or neutral
// adjectives, no animals used as insults in Turkish, no combination that reads as mockery.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAliasWords } from '../seed/content.ts';

const words = parseAliasWords(
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../content/aliases-tr.json'), 'utf8')),
);

// Animals used as insults or with a mocking idiom ("tavuk beyinli", "balık hafızalı", ...), and
// ones tied to football rivalry nicknames.
const FORBIDDEN_ANIMALS = [
  'Domuz',
  'Eşek',
  'Öküz',
  'It',
  'Köpek',
  'Enik',
  'İnek',
  'Sığır',
  'Dana',
  'Maymun',
  'Ayı',
  'Keçi',
  'Teke',
  'Koyun',
  'Koç',
  'Katır',
  'Deve',
  'Tavuk',
  'Horoz',
  'Kaz',
  'Hindi',
  'Karga',
  'Yılan',
  'Çakal',
  'Sırtlan',
  'Akbaba',
  'Fare',
  'Sıçan',
  'Kurbağa',
  'Kene',
  'Sülük',
  'Bit',
  'Pire',
  'Hamamböceği',
  'Solucan',
  'Salyangoz',
  'Kaplumbağa',
  'Balina',
  'Fil',
  'Su aygırı',
  'Gergedan',
  'Zürafa',
  'Geyik',
  'Tilki',
  'Yarasa',
  'Örümcek',
  'Papağan',
  'Tavus',
  'Balık',
  'Kanarya',
  'Timsah',
  'Yalıçapkını',
];

// Adjectives that are negative or turn any animal into mockery.
const FORBIDDEN_ADJECTIVES = [
  'Kara',
  'Deli',
  'Çılgın',
  'Tembel',
  'Uykucu',
  'Şişko',
  'Tombul',
  'Kel',
  'Sarhoş',
  'Aptal',
  'Salak',
  'Yaşlı',
  'Çirkin',
  'Kurnaz',
  'Uyanık',
  'Hızlı',
  'Yavaş',
  'Kocaman',
  'Minik',
  'Cüce',
  'Pembe',
  'Fıstık',
  'Tatlı',
  'Çapkın',
  'Kötü',
  'Pis',
  'Sinsi',
];

function lower(word: string): string {
  return word.toLocaleLowerCase('tr-TR');
}

describe('content/aliases-tr.json', () => {
  it('has enough words for unique aliases at a busy venue', () => {
    expect(words.adjectives.length).toBeGreaterThanOrEqual(40);
    expect(words.animals.length).toBeGreaterThanOrEqual(40);
  });

  it('has no duplicates', () => {
    for (const list of [words.adjectives, words.animals]) {
      expect(new Set(list.map(lower)).size).toBe(list.length);
    }
  });

  it('uses single capitalized words', () => {
    for (const word of [...words.adjectives, ...words.animals]) {
      expect(word, word).toMatch(/^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+$/);
    }
  });

  it('contains no forbidden animals', () => {
    const forbidden = new Set(FORBIDDEN_ANIMALS.map(lower));
    expect(words.animals.filter((w) => forbidden.has(lower(w)))).toEqual([]);
  });

  it('contains no forbidden adjectives', () => {
    const forbidden = new Set(FORBIDDEN_ADJECTIVES.map(lower));
    expect(words.adjectives.filter((w) => forbidden.has(lower(w)))).toEqual([]);
  });
});
