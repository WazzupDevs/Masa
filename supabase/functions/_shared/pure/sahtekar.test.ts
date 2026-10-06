import { describe, expect, it } from 'vitest';

import {
  cardOf,
  clueOrder,
  isPlayerCount,
  type LocalSahtekar,
  mayVote,
  newLocalGame,
  reduceLocal,
  SAHTEKAR,
  seatsOf,
  tableOfSeat,
  tally,
  winnerOf,
} from './sahtekar.ts';

const deck = {
  category: 'Tatlı',
  word: 'Baklava',
  options: ['Künefe', 'Baklava', 'Sütlaç', 'Revani', 'Lokma', 'Kadayıf'],
};

describe('seats and order', () => {
  it('labels the owner table A and the guest table B', () => {
    expect(seatsOf({ owner: 2, guest: 3 })).toEqual(['A1', 'A2', 'B1', 'B2', 'B3']);
    expect(seatsOf({ owner: 3, guest: 0 })).toEqual(['A1', 'A2', 'A3']);
    expect(tableOfSeat('A2')).toBe('owner');
    expect(tableOfSeat('B1')).toBe('guest');
  });

  it('takes 1 to 4 players per table', () => {
    expect([0, 1, 4, 5, 2.5, '3'].map(isPlayerCount)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('alternates the tables, puts the longer table’s extra seats last, and plays two rounds', () => {
    expect(clueOrder(['A1', 'A2', 'A3', 'B1'])).toEqual([
      'A1',
      'B1',
      'A2',
      'A3',
      'A1',
      'B1',
      'A2',
      'A3',
    ]);
    expect(clueOrder(['A1', 'B1', 'B2'])).toEqual(['A1', 'B1', 'B2', 'A1', 'B1', 'B2']);
    expect(clueOrder([])).toEqual([]);
    expect(SAHTEKAR.clueRounds).toBe(2);
  });
});

describe('the vote', () => {
  it('names the seat with the most votes, and nobody on a tie or without votes', () => {
    expect(tally({ A1: 'B1', A2: 'B1', B1: 'A1' })).toBe('B1');
    expect(tally({ A1: 'B1', B1: 'A1' })).toBeNull();
    expect(tally({ A1: 'B1', A2: 'B1', B1: 'A1', B2: 'A1', A3: 'B2' })).toBeNull();
    expect(tally({})).toBeNull();
  });

  it('lets a seat that saw its card vote once, never for itself', () => {
    const seats = ['A1', 'A2', 'B1'];
    expect(mayVote(seats, seats, {}, 'A1', 'B1')).toBe(true);
    expect(mayVote(seats, seats, {}, 'A1', 'A1')).toBe(false);
    expect(mayVote(seats, seats, { A1: 'B1' }, 'A1', 'A2')).toBe(false);
    expect(mayVote(['A1', 'B1'], seats, {}, 'A2', 'B1')).toBe(false);
    expect(mayVote(seats, seats, {}, 'A1', 'C9')).toBe(false);
  });

  it('gives the game to the tables only when the impostor is caught and guesses wrong', () => {
    expect(winnerOf('B1', 'B1', false)).toBe('tables');
    expect(winnerOf('B1', 'B1', true)).toBe('imposter');
    expect(winnerOf('B1', 'A1', false)).toBe('imposter');
    expect(winnerOf('B1', null, false)).toBe('imposter');
  });
});

describe('one-table game', () => {
  const t0 = Date.parse('2026-10-06T12:00:00Z');
  const start = (imposterIndex = 1) => newLocalGame(deck, 3, t0, () => (imposterIndex + 0.5) / 3);
  const play = (game: LocalSahtekar, ...steps: [Parameters<typeof reduceLocal>[1], number][]) =>
    steps.reduce((g, [action, now]) => reduceLocal(g, action, now), game);

  it('needs at least 3 players', () => {
    expect(() => newLocalGame(deck, 2, t0)).toThrow('not_enough_players');
    expect(start().seats).toEqual(['A1', 'A2', 'A3']);
  });

  it('shows the word to every seat but the impostor, who sees only the category', () => {
    const game = start(1);
    expect(game.imposter).toBe('A2');
    expect(cardOf(game, 'A1')).toEqual({ category: 'Tatlı', word: 'Baklava', imposter: false });
    expect(cardOf(game, 'A2')).toEqual({ category: 'Tatlı', word: null, imposter: true });
  });

  it('lets a seat look again, and starts the clues when the last seat has seen its card', () => {
    let game = play(
      start(),
      [{ type: 'view', seat: 'A1' }, t0],
      [{ type: 'view', seat: 'A1' }, t0],
    );
    expect(game).toMatchObject({ phase: 'viewing', viewed: ['A1'] });
    game = play(game, [{ type: 'view', seat: 'A2' }, t0], [{ type: 'view', seat: 'A3' }, t0 + 5]);
    expect(game).toMatchObject({
      phase: 'clues',
      order: ['A1', 'A2', 'A3', 'A1', 'A2', 'A3'],
      step: 0,
      endsAt: t0 + 5 + SAHTEKAR.clueSeconds * 1000,
    });
  });

  it('skips a seat that did not look in 2 minutes: no clue, no vote', () => {
    let game = play(
      start(1),
      [{ type: 'view', seat: 'A1' }, t0],
      [{ type: 'view', seat: 'A2' }, t0],
    );
    game = reduceLocal(game, { type: 'tick' }, t0 + SAHTEKAR.viewSeconds * 1000 - 1);
    expect(game.phase).toBe('viewing');
    game = reduceLocal(game, { type: 'tick' }, t0 + SAHTEKAR.viewSeconds * 1000);
    expect(game.order).toEqual(['A1', 'A2', 'A1', 'A2']);
    expect(
      reduceLocal({ ...game, phase: 'voting' }, { type: 'vote', voter: 'A3', target: 'A1' }, t0)
        .votes,
    ).toEqual({});
  });

  it('moves on with Söyledi or after 15 seconds, then votes for 90 seconds', () => {
    let game = play(
      start(),
      [{ type: 'view', seat: 'A1' }, t0],
      [{ type: 'view', seat: 'A2' }, t0],
      [{ type: 'view', seat: 'A3' }, t0],
    );
    game = reduceLocal(game, { type: 'said', step: 0 }, t0 + 1000);
    expect(game.step).toBe(1);
    // A press on a step already past is ignored.
    expect(reduceLocal(game, { type: 'said', step: 0 }, t0 + 1000)).toBe(game);
    for (let i = 0; i < 5; i++) game = reduceLocal(game, { type: 'tick' }, game.endsAt);
    expect(game.phase).toBe('voting');
    expect(game.endsAt - t0).toBeGreaterThanOrEqual(SAHTEKAR.voteSeconds * 1000);
  });

  it('catches the impostor and lets a wrong guess give the game to the table', () => {
    let game = play(
      start(1),
      [{ type: 'view', seat: 'A1' }, t0],
      [{ type: 'view', seat: 'A2' }, t0],
      [{ type: 'view', seat: 'A3' }, t0],
    );
    game = { ...game, phase: 'voting' };
    game = play(
      game,
      [{ type: 'vote', voter: 'A1', target: 'A2' }, t0],
      [{ type: 'vote', voter: 'A3', target: 'A2' }, t0],
      [{ type: 'vote', voter: 'A2', target: 'A1' }, t0],
    );
    expect(game).toMatchObject({ phase: 'guess', accused: 'A2' });
    expect(reduceLocal(game, { type: 'guess', option: 'Pizza' }, t0)).toBe(game);
    expect(reduceLocal(game, { type: 'guess', option: 'Künefe' }, t0)).toMatchObject({
      phase: 'done',
      guess: 'Künefe',
      winner: 'tables',
    });
    expect(reduceLocal(game, { type: 'guess', option: 'Baklava' }, t0).winner).toBe('imposter');
    // No guess in 30 seconds counts as wrong.
    expect(reduceLocal(game, { type: 'tick' }, game.endsAt).winner).toBe('tables');
  });

  it('lets the impostor escape on a tie or when the vote runs out with nobody named', () => {
    let game = play(
      start(1),
      [{ type: 'view', seat: 'A1' }, t0],
      [{ type: 'view', seat: 'A2' }, t0],
      [{ type: 'view', seat: 'A3' }, t0],
    );
    game = { ...game, phase: 'voting', endsAt: t0 + 90_000 };
    game = reduceLocal(game, { type: 'vote', voter: 'A1', target: 'A3' }, t0);
    game = reduceLocal(game, { type: 'vote', voter: 'A3', target: 'A1' }, t0);
    expect(game.phase).toBe('voting');
    expect(reduceLocal(game, { type: 'tick' }, t0 + 90_000)).toMatchObject({
      phase: 'done',
      accused: null,
      winner: 'imposter',
    });
  });
});
