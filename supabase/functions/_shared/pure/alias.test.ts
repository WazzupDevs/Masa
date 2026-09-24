import { describe, expect, it } from 'vitest';

import { formatAlias, pickAlias } from './alias.ts';

const words = { adjectives: ['Mor', 'Mavi'], animals: ['Baykuş', 'Kedi'] };

describe('pickAlias', () => {
  it('builds "Adjective Animal"', () => {
    expect(formatAlias('Mor', 'Baykuş')).toBe('Mor Baykuş');
    expect(pickAlias(words, new Set(), () => 0)).toBe('Mor Baykuş');
  });

  it('never returns an alias already used at the venue', () => {
    const used = new Set(['Mor Baykuş', 'Mor Kedi', 'Mavi Baykuş']);
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(pickAlias(words, used, () => r)).toBe('Mavi Kedi');
    }
  });

  it('spreads over all free combinations', () => {
    const seen = new Set([0, 0.25, 0.5, 0.75].map((r) => pickAlias(words, new Set(), () => r)));
    expect(seen.size).toBe(4);
  });

  it('returns null when every combination is taken', () => {
    const used = new Set(['Mor Baykuş', 'Mor Kedi', 'Mavi Baykuş', 'Mavi Kedi']);
    expect(pickAlias(words, used, Math.random)).toBeNull();
  });

  it('returns null for empty word lists', () => {
    expect(pickAlias({ adjectives: [], animals: ['Kedi'] }, new Set(), Math.random)).toBeNull();
  });
});
