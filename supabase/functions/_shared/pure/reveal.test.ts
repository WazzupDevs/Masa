import { describe, expect, it } from 'vitest';

import { isRevealToken, pickRevealToken, REVEAL, REVEAL_COLORS, REVEAL_EMOJIS } from './reveal.ts';

describe('reveal rules', () => {
  it('match the spec', () => {
    expect(REVEAL).toEqual({ decisionSeconds: 60, signalSeconds: 60 });
  });

  it('picks a color and an emoji from the palette', () => {
    expect(pickRevealToken(() => 0)).toEqual({ color: REVEAL_COLORS[0], emoji: REVEAL_EMOJIS[0] });
    const last = pickRevealToken(() => 0.999999);
    expect(REVEAL_COLORS).toContain(last.color);
    expect(REVEAL_EMOJIS).toContain(last.emoji);
  });

  it('uses distinct, readable colors and single emojis', () => {
    expect(new Set(REVEAL_COLORS).size).toBe(REVEAL_COLORS.length);
    expect(REVEAL_COLORS.every((c) => /^#[0-9A-F]{6}$/.test(c))).toBe(true);
    expect(new Set(REVEAL_EMOJIS).size).toBe(REVEAL_EMOJIS.length);
  });

  it('recognises tokens', () => {
    expect(isRevealToken({ color: REVEAL_COLORS[1], emoji: REVEAL_EMOJIS[1] })).toBe(true);
    expect(isRevealToken({ color: 'red' })).toBe(false);
    expect(isRevealToken(null)).toBe(false);
  });
});
