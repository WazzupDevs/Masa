import { describe, expect, it } from 'vitest';

import {
  myReaction,
  nextReaction,
  parseDmReactions,
  parseQuote,
  parseReactionCounts,
  withMyReaction,
} from './messageExtras.ts';

describe('parseQuote', () => {
  it('reads a quote, a gone one and no reply', () => {
    expect(parseQuote({ id: 'm1', body: 'selam', from_me: true })).toEqual({
      gone: false,
      id: 'm1',
      body: 'selam',
      fromMe: true,
      name: null,
    });
    expect(parseQuote({ id: 'm1', body: 'selam', from_me: false, name: 'Mor Kedi' })).toEqual({
      gone: false,
      id: 'm1',
      body: 'selam',
      fromMe: false,
      name: 'Mor Kedi',
    });
    expect(parseQuote({ gone: true })).toEqual({ gone: true });
    expect(parseQuote({ body: 'eksik' })).toEqual({ gone: true });
    expect(parseQuote(null)).toBeNull();
  });
});

describe('reaction lists', () => {
  it('counts the DM rows per emoji and keeps the reader’s own', () => {
    expect(
      parseDmReactions([
        { emoji: '👍', from_me: false },
        { emoji: '👍', from_me: true },
        { emoji: '💩', from_me: false },
      ]),
    ).toEqual([{ emoji: '👍', count: 2, mine: true }]);
    expect(parseDmReactions('x')).toEqual([]);
  });

  it('reads counts, with the room’s aliases, and leaves out an emoji outside the set', () => {
    expect(
      parseReactionCounts([
        { emoji: '🔥', count: 2, mine: false, aliases: ['Mor Kedi', 'Sarı Ayı'] },
        { emoji: '👍', count: 1, mine: true },
        { emoji: '💩', count: 3, mine: false },
      ]),
    ).toEqual([
      { emoji: '🔥', count: 2, mine: false, aliases: ['Mor Kedi', 'Sarı Ayı'] },
      { emoji: '👍', count: 1, mine: true },
    ]);
  });
});

describe('a tap on an emoji', () => {
  it('takes the same emoji back and replaces another', () => {
    expect(nextReaction(null, '👍')).toBe('👍');
    expect(nextReaction('👍', '👍')).toBeNull();
    expect(nextReaction('👍', '🔥')).toBe('🔥');
  });

  it('moves the reader’s reaction in the list at once', () => {
    const list = [
      { emoji: '👍' as const, count: 2, mine: true },
      { emoji: '🔥' as const, count: 1, mine: false },
    ];
    expect(myReaction(list)).toBe('👍');
    expect(withMyReaction(list, '🔥')).toEqual([
      { emoji: '👍', count: 1, mine: false },
      { emoji: '🔥', count: 2, mine: true },
    ]);
    expect(withMyReaction(list, null)).toEqual([
      { emoji: '👍', count: 1, mine: false },
      { emoji: '🔥', count: 1, mine: false },
    ]);
    expect(withMyReaction([], '😂')).toEqual([{ emoji: '😂', count: 1, mine: true }]);
    expect(myReaction([])).toBeNull();
  });

  it('moves the reader’s table alias with it in the room chat', () => {
    const list = [{ emoji: '👍' as const, count: 2, mine: true, aliases: ['Mor Kedi', 'Ben'] }];
    expect(withMyReaction(list, '🔥', 'Ben')).toEqual([
      { emoji: '👍', count: 1, mine: false, aliases: ['Mor Kedi'] },
      { emoji: '🔥', count: 1, mine: true, aliases: ['Ben'] },
    ]);
  });
});
