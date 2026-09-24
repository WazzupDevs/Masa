// Guards content/profanity-tr.json: normalized terms are unique, and everyday Turkish words that
// collide with short roots after letter folding (sık → sik, ananın → anani) are never flagged.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  containsProfanity,
  prepareTerms,
} from '../../supabase/functions/_shared/pure/profanity.ts';
import { normalize } from '../../supabase/functions/_shared/pure/trText.ts';
import { parseProfanity } from '../seed/content.ts';

const terms = parseProfanity(
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../content/profanity-tr.json'), 'utf8')),
);
const prepared = prepareTerms(terms);

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
];

describe('content/profanity-tr.json', () => {
  it('has unique terms after normalization', () => {
    const normalized = terms.map((t) => normalize(t).trim());
    expect(new Set(normalized).size).toBe(terms.length);
  });

  it('flags every listed term on its own', () => {
    for (const term of terms) expect(containsProfanity(term, prepared), term).toBe(true);
  });

  it('never flags everyday sentences', () => {
    for (const sentence of EVERYDAY) {
      expect(containsProfanity(sentence, prepared), sentence).toBe(false);
    }
  });
});
