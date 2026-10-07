import { describe, expect, it } from 'vitest';

import {
  applyMark,
  describingTableForTurn,
  isVoiceTabu,
  type Mark,
  MARK_POINTS,
  mayBeginTurn,
  mayMark,
  optimisticView,
  parseBetweenGames,
  parseGameState,
  parseReadyTurn,
  pendingAfter,
  roleOf,
  summarizeTurn,
  TABU,
  tabuMode,
  turnCue,
  type CooperativeTabuState,
  voiceWinner,
  type RefereedTabuState,
} from './tabu.ts';

const now = Date.parse('2026-10-06T20:00:00Z');
const state: RefereedTabuState = {
  concept: 'tabu',
  mode: 'refereed',
  phase: 'playing',
  gameNo: 1,
  turnNo: 1,
  totalTurns: 6,
  turnSeconds: 60,
  cardsPerTurn: 40,
  describingTable: 'owner',
  turnPhase: 'running',
  turnEndsAt: '2026-10-06T20:00:30Z',
  readyEndsAt: null,
  lastTurn: null,
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

describe('tabuMode (S3: per game, from the two headcounts)', () => {
  it('is cooperative when either table is one person, refereed when both are 2+', () => {
    expect(tabuMode(1, 1)).toBe('cooperative');
    expect(tabuMode(1, 3)).toBe('cooperative');
    expect(tabuMode(4, 1)).toBe('cooperative');
    expect(tabuMode(2, 2)).toBe('refereed');
    expect(tabuMode(3, 4)).toBe('refereed');
  });
});

const coop: CooperativeTabuState = { ...state, mode: 'cooperative', scores: { team: 0 } };

describe('cooperative mode', () => {
  it('gives the other table the guesser role', () => {
    expect(roleOf(coop, 'owner')).toBe('describer');
    expect(roleOf(coop, 'guest')).toBe('guesser');
  });

  it('lets only the describing table press, all three, into one team score', () => {
    const correct = applyMark(coop, mark(0, 'correct'), 'describer', now);
    expect(correct).toEqual({
      kind: 'applied',
      state: { ...coop, scores: { team: 1 }, cardIndex: 1 },
    });
    const taboo = applyMark(coop, mark(0, 'taboo'), 'describer', now);
    expect(taboo.kind === 'applied' && taboo.state.scores).toEqual({ team: -1 });
    const pass = applyMark(coop, mark(0, 'pass'), 'describer', now);
    expect(pass.kind === 'applied' && [pass.state.scores, pass.state.passesUsed]).toEqual([
      { team: 0 },
      1,
    ]);
    for (const result of ['correct', 'taboo', 'pass'] as const) {
      expect(applyMark(coop, mark(0, result), 'guesser', now)).toEqual({
        kind: 'rejected',
        reason: 'not_describer',
      });
    }
  });

  it('keeps one score across turns whichever table describes', () => {
    const second = { ...coop, turnNo: 2, describingTable: 'guest' as const, scores: { team: 3 } };
    expect(roleOf(second, 'guest')).toBe('describer');
    const out = applyMark(second, mark(0, 'correct', 2), 'describer', now);
    expect(out.kind === 'applied' && out.state.scores).toEqual({ team: 4 });
  });

  it('limits passes as in the refereed mode', () => {
    expect(applyMark({ ...coop, passesUsed: 3 }, mark(0, 'pass'), 'describer', now)).toEqual({
      kind: 'rejected',
      reason: 'no_passes_left',
    });
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
    for (const result of ['correct', 'taboo', 'pass'] as const) {
      expect(mayMark('guesser', result)).toBe(false);
    }
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
    expect(
      applyMark(state, mark(0, 'correct'), 'judge', Date.parse(state.turnEndsAt ?? '')),
    ).toEqual({
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

  it('reads the cooperative state with its team score, and the old voice name as refereed', () => {
    const parsed = parseGameState(JSON.parse(JSON.stringify(coop)));
    expect(parsed).toEqual(coop);
    expect(parseGameState({ ...coop, scores: { owner: 1, guest: 2 } })).toBeNull();
    expect(parseGameState({ ...state, scores: { team: 1 } })).toBeNull();
    expect(parseGameState({ ...state, mode: 'voice' })).toEqual(state);
    expect(parseGameState({ ...state, mode: 'mystery' })).toBeNull();
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

describe('parseBetweenGames', () => {
  it('reads the counter and the last game between games', () => {
    expect(
      parseBetweenGames({
        gameNo: 2,
        lastGame: { concept: 'tabu', scores: { owner: 4, guest: 3 } },
      }),
    ).toEqual({
      gameNo: 2,
      lastGame: {
        concept: 'tabu',
        scores: { owner: 4, guest: 3 },
        teamScore: null,
        abandoned: null,
        sahtekar: null,
        say: null,
        ibre: null,
      },
    });
    expect(parseBetweenGames({ gameNo: 1, lastGame: { concept: 'sohbet' } })).toEqual({
      gameNo: 1,
      lastGame: {
        concept: 'sohbet',
        scores: null,
        teamScore: null,
        abandoned: null,
        sahtekar: null,
        say: null,
        ibre: null,
      },
    });
  });

  it('reads an İbre game’s last reveal and bullseyes', () => {
    const reveal = {
      roundNo: 4,
      scale: { left: 'Ucuz', right: 'Pahalı' },
      table: 'guest',
      target: 34,
      needle: 41,
      band: 3,
      side: 'left',
      sidePoint: true,
    };
    expect(
      parseBetweenGames({
        gameNo: 3,
        lastGame: {
          concept: 'ibre',
          scores: { owner: 7, guest: 9 },
          bullseyes: { owner: 1, guest: 0 },
          reveal,
        },
      }).lastGame,
    ).toMatchObject({
      concept: 'ibre',
      scores: { owner: 7, guest: 9 },
      ibre: { reveal, bullseyes: { owner: 1, guest: 0 } },
    });
    expect(
      parseBetweenGames({
        lastGame: { concept: 'ibre', abandoned: true, turnNo: 2, totalTurns: 4 },
      }).lastGame?.ibre,
    ).toBeNull();
  });

  it('is empty for a fresh room or anything malformed', () => {
    expect(parseBetweenGames({})).toEqual({ gameNo: 0, lastGame: null });
    expect(parseBetweenGames(null)).toEqual({ gameNo: 0, lastGame: null });
    expect(parseBetweenGames({ gameNo: 'x', lastGame: { concept: 'poker' } })).toEqual({
      gameNo: 0,
      lastGame: null,
    });
    expect(
      parseBetweenGames({ lastGame: { concept: 'tabu', scores: { owner: '4' } } }).lastGame,
    ).toEqual({
      concept: 'tabu',
      scores: null,
      teamScore: null,
      abandoned: null,
      sahtekar: null,
      say: null,
      ibre: null,
    });
    expect(
      parseBetweenGames({ gameNo: 1, lastGame: { concept: 'tabu', scores: { team: 7 } } }),
    ).toEqual({
      gameNo: 1,
      lastGame: {
        concept: 'tabu',
        scores: null,
        teamScore: 7,
        abandoned: null,
        sahtekar: null,
        say: null,
        ibre: null,
      },
    });
  });

  it('reads where an abandoned game stopped', () => {
    expect(
      parseBetweenGames({
        gameNo: 1,
        lastGame: { concept: 'tabu', abandoned: true, turnNo: 3, totalTurns: 6 },
      }).lastGame,
    ).toEqual({
      concept: 'tabu',
      scores: null,
      teamScore: null,
      abandoned: { turnNo: 3, totalTurns: 6 },
      sahtekar: null,
      say: null,
      ibre: null,
    });
    expect(
      parseBetweenGames({ lastGame: { concept: 'tabu', abandoned: true, turnNo: '3' } }).lastGame
        ?.abandoned,
    ).toBeNull();
  });
});

describe('ready turns (docs/SPEC_V3.md §19.1)', () => {
  it('waits 15 seconds before either table may start the clock', () => {
    expect(TABU.readySeconds).toBe(15);
  });

  it('sums a turn the way the server does: Doğru +1, Tabu −1, Pas 0', () => {
    expect(
      summarizeTurn(2, 'guest', ['correct', 'correct', 'taboo', 'pass', 'correct', 'pass']),
    ).toEqual({ turnNo: 2, describingTable: 'guest', score: 2, correct: 3, taboo: 1, pass: 2 });
    expect(summarizeTurn(1, 'owner', [])).toEqual({
      turnNo: 1,
      describingTable: 'owner',
      score: 0,
      correct: 0,
      taboo: 0,
      pass: 0,
    });
  });

  it('lets the describer start at once and the other table only after readyEndsAt', () => {
    const ends = '2026-10-05T12:00:15Z';
    const before = Date.parse('2026-10-05T12:00:10Z');
    const after = Date.parse('2026-10-05T12:00:15Z');
    expect(mayBeginTurn('describer', ends, before)).toBe(true);
    expect(mayBeginTurn('judge', ends, before)).toBe(false);
    expect(mayBeginTurn('guesser', ends, before)).toBe(false);
    expect(mayBeginTurn('judge', ends, after)).toBe(true);
    expect(mayBeginTurn('guesser', ends, after)).toBe(true);
  });

  it('reads the ready part of the state, with the last turn when there is one', () => {
    const base = { concept: 'tabu', turnPhase: 'ready', readyEndsAt: '2026-10-05T12:00:15Z' };
    expect(parseReadyTurn(base)).toEqual({ readyEndsAt: base.readyEndsAt, lastTurn: null });
    const lastTurn = {
      turnNo: 1,
      describingTable: 'owner',
      score: 3,
      correct: 4,
      taboo: 1,
      pass: 2,
    };
    expect(parseReadyTurn({ ...base, lastTurn })).toEqual({
      readyEndsAt: base.readyEndsAt,
      lastTurn,
    });
    expect(parseReadyTurn({ ...base, lastTurn: { ...lastTurn, score: '3' } })?.lastTurn).toBeNull();
  });

  it('is null for a running turn, a game from before §19.1, or anything else', () => {
    expect(parseReadyTurn({ concept: 'tabu', turnPhase: 'running' })).toBeNull();
    expect(parseReadyTurn({ concept: 'tabu', turnEndsAt: '2026-10-05T12:01:00Z' })).toBeNull();
    expect(parseReadyTurn({ concept: 'tabu', turnPhase: 'ready' })).toBeNull();
    expect(parseReadyTurn({ concept: 'sohbet', turnPhase: 'ready', readyEndsAt: 'x' })).toBeNull();
    expect(parseReadyTurn(null)).toBeNull();
  });
});

describe('turn feedback (docs/SPEC_V3.md §19.2)', () => {
  it('ticks in each of the last 5 seconds and marks the end', () => {
    expect([8, 6, 5, 3, 1, 0].map((s) => turnCue(s)?.kind ?? null)).toEqual([
      null,
      null,
      'tick',
      'tick',
      'tick',
      'timeUp',
    ]);
    expect(turnCue(-1)).toBeNull();
    expect(turnCue(0)?.vibrateMs).toBeGreaterThan(turnCue(1)?.vibrateMs ?? 0);
  });

  it('parses a ready turn with its summary and no clock', () => {
    const ready = parseGameState({
      ...state,
      turnPhase: 'ready',
      turnEndsAt: undefined,
      readyEndsAt: '2026-10-06T20:00:15Z',
      lastTurn: { turnNo: 1, describingTable: 'guest', score: 2, correct: 3, taboo: 1, pass: 0 },
    });
    expect(ready).toMatchObject({
      turnPhase: 'ready',
      turnEndsAt: null,
      readyEndsAt: '2026-10-06T20:00:15Z',
      lastTurn: { turnNo: 1, score: 2 },
    });
    expect(applyMark(ready as RefereedTabuState, mark(0, 'correct'), 'judge', now)).toEqual({
      kind: 'rejected',
      reason: 'turn_not_started',
    });
    // A ready turn without readyEndsAt is not a state.
    expect(parseGameState({ ...state, turnPhase: 'ready', turnEndsAt: undefined })).toBeNull();
  });
});
