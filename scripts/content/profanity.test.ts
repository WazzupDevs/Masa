// Guards content/profanity-tr.json: terms are unique as matched (tr-TR lowercase, Turkish letters
// kept), and everyday words close to listed ones (sık, şık, ananın, "got it") are never flagged.
// A new term that flags an everyday word here goes to `wholeWords`, or is left out.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  containsProfanity,
  prepareTerms,
} from '../../supabase/functions/_shared/pure/profanity.ts';
import { normalize } from '../../supabase/functions/_shared/pure/trText.ts';
import { parseProfanity } from '../seed/content.ts';

const list = parseProfanity(
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../content/profanity-tr.json'), 'utf8')),
);
const terms = [...list.terms, ...list.wholeWords];
const prepared = prepareTerms(list.terms, list.wholeWords);

const EVERYDAY = [
  'sık sık buraya geliriz',
  'çok sıkıldım',
  'kapı sıkıştı',
  'bir sıkıntı yok',
  'limonu sık',
  'bir sıkım tuz',
  'ananın yemeği harika',
  'annenin selamı var',
  'çantayı götürdüm',
  'amacımız eğlenmek',
  'ama neden',
  'malzemeler hazır',
  'resim çekelim, pic atarım',
  'amatör bir oyuncuyum',
  'taşımak zor',
  'kahve içelim',
  'yarar sağlar',
  'yarasa gibi uyanığım',
  'aminoasit',
  'kanca attım',
  'Ankara, İstanbul, İzmir',
  'I got it',
  'got it',
  'çok şık olmuşsun',
  'sık sık',
  'bu film çok sıkıcı',
  'şık',
  'sık',
  'sıkıcı',
  'sıkıldım',
  'ananın',
  'Şık Sık',
];

describe('content/profanity-tr.json', () => {
  it('has unique terms as matched (Turkish letters kept)', () => {
    const normalized = terms.map((t) => normalize(t, { fold: false }).trim());
    expect(new Set(normalized).size).toBe(terms.length);
  });

  it('flags every listed term on its own', () => {
    for (const term of terms) expect(containsProfanity(term, prepared), term).toBe(true);
  });

  it('restores the terms that folding used to collide with', () => {
    for (const word of ['sik', 'piç', 'göt', 'sikim', 'sikiş', 'ananı']) {
      expect(containsProfanity(word, prepared), word).toBe(true);
    }
  });

  it('never flags everyday sentences', () => {
    for (const sentence of EVERYDAY) {
      expect(containsProfanity(sentence, prepared), sentence).toBe(false);
    }
  });
});
