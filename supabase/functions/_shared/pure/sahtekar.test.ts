import { describe, expect, it } from 'vitest';

import {
  afterViewing,
  clueRoundOf,
  ownSeats,
  parseSahtekarLastGame,
  parseSahtekarState,
  cardOf,
  clueOrder,
  isPlayerCount,
  type LocalSahtekar,
  mayVote,
  newLocalGame,
  playersOf,
  redealLocal,
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

describe('after the viewing', () => {
  const seats = ['A1', 'A2', 'B1', 'B2'];

  it('goes to the clues with every seat when all looked', () => {
    expect(afterViewing(seats, ['B2', 'A1', 'B1', 'A2'], 'B1')).toEqual({ next: 'clues', seats });
  });

  it('drops the seats that did not look, keeping seat order', () => {
    expect(afterViewing([...seats, 'A3'], ['B2', 'A1', 'A2', 'B1'], 'A1')).toEqual({
      next: 'clues',
      seats,
    });
    expect(playersOf(['A1', 'A2', 'B1'])).toEqual({ owner: 2, guest: 1 });
  });

  it('deals again when the impostor did not look, and stops under 3 seats', () => {
    expect(afterViewing(seats, ['A1', 'A2', 'B1'], 'B2')).toEqual({
      next: 'redeal',
      seats: ['A1', 'A2', 'B1'],
    });
    expect(afterViewing(seats, ['A1', 'B1'], 'A1')).toEqual({
      next: 'not_enough_players',
      seats: ['A1', 'B1'],
    });
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

  it('drops a seat that did not look in 2 minutes and goes on when the impostor looked', () => {
    // 4 players, the impostor is A2; A4 never looks.
    let game = play(
      newLocalGame(deck, 4, t0, () => 0.3),
      [{ type: 'view', seat: 'A1' }, t0],
      [{ type: 'view', seat: 'A2' }, t0],
      [{ type: 'view', seat: 'A3' }, t0],
    );
    expect(game.imposter).toBe('A2');
    game = reduceLocal(game, { type: 'tick' }, t0 + SAHTEKAR.viewSeconds * 1000 - 1);
    expect(game.phase).toBe('viewing');
    game = reduceLocal(game, { type: 'tick' }, t0 + SAHTEKAR.viewSeconds * 1000);
    expect(game).toMatchObject({ phase: 'clues', seats: ['A1', 'A2', 'A3'] });
    expect(game.order).toEqual(['A1', 'A2', 'A3', 'A1', 'A2', 'A3']);
    // A4 is out: no vote from it, none for it.
    const voting = { ...game, phase: 'voting' as const };
    expect(reduceLocal(voting, { type: 'vote', voter: 'A4', target: 'A1' }, t0).votes).toEqual({});
    expect(reduceLocal(voting, { type: 'vote', voter: 'A1', target: 'A4' }, t0).votes).toEqual({});
  });

  it('deals again to the seats left when the impostor did not look; everyone looks again', () => {
    // 4 players, the impostor is A4 and never looks.
    let game = play(
      newLocalGame(deck, 4, t0, () => 0.9),
      [{ type: 'view', seat: 'A1' }, t0],
      [{ type: 'view', seat: 'A2' }, t0],
      [{ type: 'view', seat: 'A3' }, t0],
    );
    expect(game.imposter).toBe('A4');
    game = reduceLocal(game, { type: 'tick' }, t0 + SAHTEKAR.viewSeconds * 1000);
    expect(game).toMatchObject({ phase: 'redeal', seats: ['A1', 'A2', 'A3'], viewed: [] });
    // The clock does nothing while the screen fetches the new deck.
    expect(reduceLocal(game, { type: 'tick' }, t0 + 999_999)).toBe(game);
    const t1 = t0 + 200_000;
    const next = { category: 'Spor', word: 'Kürek', options: ['Kürek', 'Tenis', 'Koşu'] };
    game = redealLocal(game, next, t1, () => 0.5);
    expect(game).toMatchObject({
      phase: 'viewing',
      seats: ['A1', 'A2', 'A3'],
      imposter: 'A2',
      category: 'Spor',
      word: 'Kürek',
      viewed: [],
      endsAt: t1 + SAHTEKAR.viewSeconds * 1000,
    });
    expect(cardOf(game, 'A1').word).toBe('Kürek');
    game = play(
      game,
      [{ type: 'view', seat: 'A1' }, t1],
      [{ type: 'view', seat: 'A2' }, t1],
      [{ type: 'view', seat: 'A3' }, t1],
    );
    expect(game.phase).toBe('clues');
    // Only a game waiting for a deck takes one.
    expect(redealLocal(game, deck, t1)).toBe(game);
  });

  it('ends without a winner when fewer than 3 seats looked', () => {
    let game = play(
      start(1),
      [{ type: 'view', seat: 'A1' }, t0],
      [{ type: 'view', seat: 'A2' }, t0],
    );
    game = reduceLocal(game, { type: 'tick' }, t0 + SAHTEKAR.viewSeconds * 1000);
    expect(game).toMatchObject({ phase: 'done', winner: null, endedBy: 'not_enough_players' });
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

describe('the app reading game_state', () => {
  const state = {
    concept: 'sahtekar',
    phase: 'clues',
    gameNo: 3,
    dealNo: 2,
    players: { owner: 2, guest: 1 },
    seats: ['A1', 'A2', 'B1'],
    category: 'Tatlı',
    viewed: ['A1', 'A2', 'B1'],
    order: clueOrder(['A1', 'A2', 'B1']),
    step: 4,
    voters: [],
    votesCast: 0,
    endsAt: '2026-10-06T12:00:15Z',
  };

  it('reads a running game and refuses anything else', () => {
    expect(parseSahtekarState(state)).toMatchObject({ phase: 'clues', dealNo: 2, accused: null });
    expect(parseSahtekarState({ ...state, dealNo: undefined })?.dealNo).toBe(1);
    expect(parseSahtekarState({ ...state, phase: 'reveal' })).toBeNull();
    expect(parseSahtekarState({ ...state, concept: 'tabu' })).toBeNull();
    expect(parseSahtekarState({ ...state, seats: [1] })).toBeNull();
    expect(parseSahtekarState(null)).toBeNull();
  });

  it('reads the reveal, and a game that ended for too few seats', () => {
    expect(
      parseSahtekarLastGame({
        concept: 'sahtekar',
        players: { owner: 2, guest: 1 },
        reveal: {
          imposter: 'B1',
          word: 'Baklava',
          category: 'Tatlı',
          votes: { A1: 'B1', A2: 'B1' },
          accused: 'B1',
          winner: 'tables',
        },
      }),
    ).toEqual({
      players: { owner: 2, guest: 1 },
      reveal: {
        imposter: 'B1',
        word: 'Baklava',
        category: 'Tatlı',
        votes: { A1: 'B1', A2: 'B1' },
        accused: 'B1',
        guess: null,
        winner: 'tables',
      },
      endedBy: null,
    });
    expect(
      parseSahtekarLastGame({
        concept: 'sahtekar',
        players: { owner: 2, guest: 1 },
        endedBy: 'not_enough_players',
      }),
    ).toEqual({ players: { owner: 2, guest: 1 }, reveal: null, endedBy: 'not_enough_players' });
    expect(parseSahtekarLastGame({ concept: 'tabu' })).toBeNull();
  });

  it('finds the table’s own seats and the clue round of a step', () => {
    expect(ownSeats(['A1', 'A2', 'B1'], 'guest')).toEqual(['B1']);
    expect([0, 2, 3, 5].map((step) => clueRoundOf(step, 6))).toEqual([1, 1, 2, 2]);
  });
});
