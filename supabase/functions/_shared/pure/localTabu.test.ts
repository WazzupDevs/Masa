import { describe, expect, it } from 'vitest';

import { initialLocalTabu, localTabuReducer, type LocalTabuState } from './localTabu.ts';

const deck = Array.from({ length: 10 }, (_, i) => ({
  word: `kelime${i}`,
  forbidden: ['a', 'b', 'c', 'd', 'e'],
}));

function run(state: LocalTabuState, ...actions: Parameters<typeof localTabuReducer>[1][]) {
  return actions.reduce(localTabuReducer, state);
}

describe('localTabuReducer', () => {
  it('starts with team A, round 1', () => {
    const s = run(initialLocalTabu(deck), { type: 'start', now: 0 });
    expect(s).toMatchObject({
      phase: 'playing',
      team: 'A',
      round: 1,
      cardIndex: 0,
      turnEndsAt: 60_000,
    });
  });

  it('scores correct +1, tabu −1, pass 0 and moves to the next card', () => {
    const s = run(
      initialLocalTabu(deck),
      { type: 'start', now: 0 },
      { type: 'correct' },
      { type: 'correct' },
      { type: 'taboo' },
      { type: 'pass' },
    );
    expect(s.scores).toEqual({ A: 1, B: 0 });
    expect(s.cardIndex).toBe(4);
  });

  it('alternates teams each turn and finishes after 3 rounds per team', () => {
    let s = run(initialLocalTabu(deck), { type: 'start', now: 0 });
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(`${s.team}${s.round}`);
      s = run(s, { type: 'timeUp' });
      if (s.phase === 'between') s = run(s, { type: 'start', now: 0 });
    }
    expect(order).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
    expect(s.phase).toBe('finished');
  });

  it('resets to a new deck', () => {
    const played = run(initialLocalTabu(deck), { type: 'start', now: 0 }, { type: 'correct' });
    const fresh = run(played, { type: 'reset', deck: deck.slice(0, 3) });
    expect(fresh).toEqual(initialLocalTabu(deck.slice(0, 3)));
  });

  it('ignores card actions outside a turn and wraps the deck', () => {
    const idle = run(initialLocalTabu(deck), { type: 'correct' });
    expect(idle.scores).toEqual({ A: 0, B: 0 });
    let s = run(initialLocalTabu(deck.slice(0, 2)), { type: 'start', now: 0 });
    s = run(s, { type: 'pass' }, { type: 'pass' });
    expect(s.cardIndex).toBe(0);
  });
});
