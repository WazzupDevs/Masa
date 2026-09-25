import { describe, expect, it } from 'vitest';

import {
  applyMark,
  describingTableForTurn,
  isVoiceTabu,
  type Mark,
  MARK_POINTS,
  mayMark,
  optimisticView,
  parseGameState,
  pendingAfter,
  roleOf,
  TABU,
  voiceWinner,
  type VoiceTabuState,
} from './tabu.ts';

const now = Date.parse('2026-10-06T20:00:00Z');
const state: VoiceTabuState = {
  concept: 'tabu',
  mode: 'voice',
  phase: 'playing',
  gameNo: 1,
  turnNo: 1,
  totalTurns: 6,
  turnSeconds: 60,
  cardsPerTurn: 40,
  describingTable: 'owner',
  turnEndsAt: '2026-10-06T20:00:30Z',
  scores: { owner: 0, guest: 0 },
  passesUsed: 0,
  maxPasses: 3,
  cardIndex: 0,
};
const mark = (cardIndex: number, result: Mark['result'], turnNo = 1): Mark => ({
  turnNo,
  cardIndex,
  result,
});

describe('TABU rules', () => {
  it('match the spec', () => {
    expect(TABU).toMatchObject({ turnSeconds: 60, totalTurns: 6, maxPasses: 3, cardsPerTurn: 40 });
    expect(MARK_POINTS).toEqual({ correct: 1, taboo: -1, pass: 0 });
  });
});

describe('who may mark what', () => {
  it('Tabu only the judge, Pas only the describer, Doğru both', () => {
    expect(mayMark('judge', 'taboo')).toBe(true);
    expect(mayMark('describer', 'taboo')).toBe(false);
    expect(mayMark('describer', 'pass')).toBe(true);
    expect(mayMark('judge', 'pass')).toBe(false);
    expect(mayMark('describer', 'correct')).toBe(true);
    expect(mayMark('judge', 'correct')).toBe(true);
  });

  it('knows each table role from the describing table', () => {
    expect(roleOf(state, 'owner')).toBe('describer');
    expect(roleOf(state, 'guest')).toBe('judge');
  });
});

describe('applyMark', () => {
  it('scores +1, −1 and 0 for the describing table and moves to the next card', () => {
    const correct = applyMark(state, mark(0, 'correct'), 'judge', now);
    expect(correct).toEqual({
      kind: 'applied',
      state: { ...state, scores: { owner: 1, guest: 0 }, cardIndex: 1 },
    });
    const taboo = applyMark({ ...state, describingTable: 'guest' }, mark(0, 'taboo'), 'judge', now);
    expect(taboo.kind === 'applied' && taboo.state.scores).toEqual({ owner: 0, guest: -1 });
    const pass = applyMark(state, mark(0, 'pass'), 'describer', now);
    expect(pass.kind === 'applied' && [pass.state.passesUsed, pass.state.cardIndex]).toEqual([
      1, 1,
    ]);
  });

  it('refuses the wrong table', () => {
    expect(applyMark(state, mark(0, 'taboo'), 'describer', now)).toEqual({
      kind: 'rejected',
      reason: 'not_judge',
    });
    expect(applyMark(state, mark(0, 'pass'), 'judge', now)).toEqual({
      kind: 'rejected',
      reason: 'not_describer',
    });
  });

  it('ignores a second mark on the same card, another turn, and cards ahead or past the list', () => {
    const after = { ...state, cardIndex: 1 };
    expect(applyMark(after, mark(0, 'correct'), 'judge', now)).toEqual({ kind: 'ignored' });
    expect(applyMark(state, mark(0, 'correct', 2), 'judge', now)).toEqual({ kind: 'ignored' });
    expect(applyMark(state, mark(3, 'correct'), 'judge', now)).toEqual({ kind: 'ignored' });
    expect(applyMark({ ...state, cardIndex: 40 }, mark(40, 'correct'), 'judge', now)).toEqual({
      kind: 'ignored',
    });
  });

  it('limits passes and refuses after the turn or the game ended', () => {
    expect(applyMark({ ...state, passesUsed: 3 }, mark(0, 'pass'), 'describer', now)).toEqual({
      kind: 'rejected',
      reason: 'no_passes_left',
    });
    expect(applyMark(state, mark(0, 'correct'), 'judge', Date.parse(state.turnEndsAt))).toEqual({
      kind: 'rejected',
      reason: 'turn_over',
    });
    expect(applyMark({ ...state, phase: 'finished' }, mark(0, 'correct'), 'judge', now)).toEqual({
      kind: 'rejected',
      reason: 'no_game',
    });
  });
});

describe('optimistic view on the pressing phone', () => {
  it('moves on at once and matches the server once it confirms', () => {
    const pending = [mark(0, 'correct'), mark(1, 'taboo')];
    const view = optimisticView(state, pending, 'judge', now);
    expect([view.cardIndex, view.scores]).toEqual([2, { owner: 0, guest: 0 }]);

    const confirmedOne = { ...state, cardIndex: 1, scores: { owner: 1, guest: 0 } };
    expect(pendingAfter(confirmedOne, pending)).toEqual([mark(1, 'taboo')]);
    expect(optimisticView(confirmedOne, pendingAfter(confirmedOne, pending), 'judge', now)).toEqual(
      view,
    );
  });

  it("lets the server's order win when both tables pressed on the same card", () => {
    // The judge pressed Doğru on card 0, but the describer's Pas reached the server first.
    const server = { ...state, cardIndex: 1, passesUsed: 1 };
    const pending = pendingAfter(server, [mark(0, 'correct')]);
    expect(pending).toEqual([]);
    expect(optimisticView(server, pending, 'judge', now)).toEqual(server);
  });

  it('drops presses from an earlier turn', () => {
    const nextTurn = { ...state, turnNo: 2, describingTable: 'guest' as const, cardIndex: 0 };
    expect(pendingAfter(nextTurn, [mark(5, 'correct', 1)])).toEqual([]);
  });
});

describe('turns and results', () => {
  it('alternates the describing table', () => {
    expect([1, 2, 3, 4, 5, 6].map(describingTableForTurn)).toEqual([
      'owner',
      'guest',
      'owner',
      'guest',
      'owner',
      'guest',
    ]);
  });

  it('names the winner or a draw', () => {
    expect(voiceWinner({ owner: 3, guest: 2 })).toBe('owner');
    expect(voiceWinner({ owner: -1, guest: 0 })).toBe('guest');
    expect(voiceWinner({ owner: 2, guest: 2 })).toBe('draw');
  });
});

describe('parseGameState', () => {
  it('reads the voice state, which never carries a card', () => {
    const parsed = parseGameState(JSON.parse(JSON.stringify(state)));
    expect(parsed).toEqual(state);
    expect(isVoiceTabu(parsed)).toBe(true);
    expect(parseGameState({ ...state, scores: { owner: 1 } })).toBeNull();
    expect(parseGameState({ ...state, cardIndex: 'x' })).toBeNull();
  });

  it('reads a Sohbet state and rejects anything else, the written Tabu state included', () => {
    expect(
      parseGameState({
        concept: 'sohbet',
        cardId: 'c',
        theme: 'derin',
        prompt: 'Soru?',
        nextAllowedAt: 'x',
      }),
    ).toMatchObject({ concept: 'sohbet', prompt: 'Soru?' });
    expect(parseGameState({})).toBeNull();
    expect(parseGameState(null)).toBeNull();
    expect(
      parseGameState({
        concept: 'tabu',
        phase: 'playing',
        describerSessionId: 's1',
        score: 4,
      }),
    ).toBeNull();
  });
});
