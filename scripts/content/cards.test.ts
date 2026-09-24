// Guards content/tabu-cards.json and sohbet-cards.json against MVP_SPEC §11: at least 500 Tabu
// cards with 5 single-word forbidden words not sharing the target's root; at least 150 Sohbet
// cards across the 4 themes; no slang or profanity.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  containsProfanity,
  prepareTerms,
} from '../../supabase/functions/_shared/pure/profanity.ts';
import { SOHBET_THEMES } from '../../supabase/functions/_shared/pure/sohbet.ts';
import { tokenize } from '../../supabase/functions/_shared/pure/trText.ts';
import { parseProfanity, parseSohbetCards, parseTabuCards } from '../seed/content.ts';

function readContent(name: string): unknown {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, '../../content', name), 'utf8'));
}

const tabu = parseTabuCards(readContent('tabu-cards.json'));
const sohbet = parseSohbetCards(readContent('sohbet-cards.json'));
const profanityList = parseProfanity(readContent('profanity-tr.json'));
const profanity = prepareTerms(profanityList.terms, profanityList.wholeWords);

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// Stricter than the game's clue check: two words share a root when their normalized forms start
// with the same 4 letters, or one is a prefix of the other ("diş" / "dişçi").
function sameRoot(a: string, b: string): boolean {
  return commonPrefixLength(a, b) >= Math.min(4, a.length, b.length);
}

describe('content/tabu-cards.json', () => {
  it('has at least 500 cards with unique targets', () => {
    expect(tabu.length).toBeGreaterThanOrEqual(500);
    const targets = tabu.map((c) => tokenize(c.word).join(' '));
    const duplicates = targets.filter((t, i) => targets.indexOf(t) !== i);
    expect(duplicates).toEqual([]);
  });

  it('has exactly 5 distinct single-word forbidden words per card', () => {
    const bad = tabu.filter((c) => {
      const words = c.forbidden.map((f) => tokenize(f));
      return (
        c.forbidden.length !== 5 ||
        words.some((w) => w.length !== 1) ||
        new Set(words.map((w) => w[0])).size !== 5
      );
    });
    expect(bad.map((c) => c.word)).toEqual([]);
  });

  it('never forbids a word sharing a root with the target', () => {
    const clashes = tabu.flatMap((c) => {
      const targetTokens = tokenize(c.word);
      return c.forbidden
        .filter((f) => targetTokens.some((t) => sameRoot(t, tokenize(f)[0] ?? '')))
        .map((f) => `${c.word} / ${f}`);
    });
    expect(clashes).toEqual([]);
  });

  it('contains no profanity', () => {
    const flagged = tabu.filter((c) =>
      [c.word, ...c.forbidden].some((w) => containsProfanity(w, profanity)),
    );
    expect(flagged.map((c) => c.word)).toEqual([]);
  });
});

describe('content/sohbet-cards.json', () => {
  it('has at least 150 unique cards spread over the 4 themes', () => {
    expect(sohbet.length).toBeGreaterThanOrEqual(150);
    const prompts = sohbet.map((c) => tokenize(c.prompt).join(' '));
    expect(new Set(prompts).size).toBe(prompts.length);
    for (const theme of SOHBET_THEMES) {
      expect(sohbet.filter((c) => c.theme === theme).length, theme).toBeGreaterThanOrEqual(30);
    }
  });

  it('keeps prompts short and clean', () => {
    const bad = sohbet.filter(
      (c) => [...c.prompt].length > 140 || containsProfanity(c.prompt, profanity),
    );
    expect(bad.map((c) => c.prompt)).toEqual([]);
  });
});
