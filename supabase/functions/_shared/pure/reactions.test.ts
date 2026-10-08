import { describe, expect, it } from 'vitest';

import { isReaction, REACTIONS } from './reactions.ts';

describe('reactions', () => {
  it('are six distinct emojis', () => {
    expect(REACTIONS).toHaveLength(6);
    expect(new Set(REACTIONS).size).toBe(6);
  });

  it('accepts only the set', () => {
    expect(isReaction('🔥')).toBe(true);
    expect(isReaction('💩')).toBe(false);
    expect(isReaction(null)).toBe(false);
  });
});
