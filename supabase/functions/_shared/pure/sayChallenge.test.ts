import { describe, expect, it } from 'vitest';

import {
  HARF_LETTERS,
  mayObject,
  newSayGame,
  roundStarter,
  SAY_CONFIG,
  sayAdvance,
  sayBegin,
  sayClaim,
  sayObject,
  type SayState,
  sayWinner,
  turnSeconds,
} from './sayChallenge.ts';

const t0 = Date.parse('2026-10-06T12:00:00Z');
const prompts = (...list: string[]) => {
  let i = 0;
  return () => list[i++] ?? `p${i}`;
};

function running(kind: 'harf' | 'sarki', now = t0): SayState {
  return sayBegin(newSayGame(kind, kind === 'harf' ? 'Meyve' : 'aşk', now), 'owner', now);
}

describe('the clock and the turns', () => {
  it('opens round 1 ready for the owner table; Başla from it, or from either after 10 seconds', () => {
    const game = newSayGame('harf', 'Meyve', t0);
    expect(game).toMatchObject({
      turnPhase: 'ready',
      readyEndsAt: t0 + 10_000,
      turnTable: 'owner',
      roundNo: 1,
      totalRounds: 5,
      objectionsLeft: { owner: 3, guest: 3 },
    });
    expect(game.letters).toHaveLength(23);
    expect(sayBegin(game, 'guest', t0 + 9_999)).toBe(game);
    expect(sayBegin(game, 'guest', t0 + 10_000)).toMatchObject({
      turnPhase: 'running',
      endsAt: t0 + 20_000,
    });
    expect(sayBegin(game, 'owner', t0 + 1)).toMatchObject({ endsAt: t0 + 10_001 });
  });

  it('alternates the starting table and shortens Şarkıda Geçsin’s last two words', () => {
    expect([1, 2, 3, 4, 5].map(roundStarter)).toEqual([
      'owner',
      'guest',
      'owner',
      'guest',
      'owner',
    ]);
    expect([1, 6, 7, 8].map((n) => turnSeconds('sarki', n))).toEqual([10, 10, 5, 5]);
    expect([1, 5].map((n) => turnSeconds('harf', n))).toEqual([10, 10]);
  });
});

describe('Harf Kapmaca', () => {
  it('closes an open letter, passes the turn and opens the objection window', () => {
    const game = sayClaim(running('harf'), 'owner', 1, 0, 'E', t0 + 2_000);
    expect(game).toMatchObject({
      step: 1,
      turnTable: 'guest',
      lastClaim: { table: 'owner', step: 0, letter: 'E' },
      objectionEndsAt: t0 + 5_000,
      endsAt: t0 + 12_000,
    });
    expect(game.letters.find((l) => l.letter === 'E')?.closed).toBe(true);
    // A closed letter, another table, a stale step or round, and after the clock: ignored.
    expect(sayClaim(game, 'guest', 1, 1, 'E', t0 + 3_000)).toBe(game);
    expect(sayClaim(game, 'owner', 1, 1, 'K', t0 + 3_000)).toBe(game);
    expect(sayClaim(game, 'guest', 1, 0, 'K', t0 + 3_000)).toBe(game);
    expect(sayClaim(game, 'guest', 2, 1, 'K', t0 + 3_000)).toBe(game);
    expect(sayClaim(game, 'guest', 1, 1, 'K', t0 + 12_000)).toBe(game);
    expect(sayClaim(game, 'guest', 1, 1, 'X', t0 + 3_000)).toBe(game);
  });

  it('lets the other table object within 3 seconds: the claimer loses the round', () => {
    const claimed = sayClaim(running('harf'), 'owner', 1, 0, 'E', t0);
    expect(mayObject(claimed, 'guest', t0 + 2_999)).toBe(true);
    expect(mayObject(claimed, 'owner', t0)).toBe(false);
    expect(mayObject(claimed, 'guest', t0 + 3_000)).toBe(false);
    expect(sayObject(claimed, 'owner', 1, 0, prompts('Hayvan'), t0)).toBe(claimed);
    expect(sayObject(claimed, 'guest', 1, 0, prompts('Hayvan'), t0 + 3_000)).toBe(claimed);
    const next = sayObject(claimed, 'guest', 1, 0, prompts('Hayvan'), t0 + 1_000);
    expect(next).toMatchObject({
      roundNo: 2,
      prompt: 'Hayvan',
      turnTable: 'guest',
      turnPhase: 'ready',
      readyEndsAt: t0 + 11_000,
      step: 0,
      scores: { owner: 0, guest: 1 },
      objectionsLeft: { owner: 3, guest: 2 },
      lastRound: { roundNo: 1, winner: 'guest', reason: 'objection' },
    });
    expect(next.letters.every((l) => !l.closed)).toBe(true);
  });

  it('refuses an objection when a table has none left', () => {
    let game = running('harf');
    for (let round = 1; round <= 3; round++) {
      const by = game.turnTable;
      game = sayBegin(game, by, t0);
      game = sayClaim(game, by, round, 0, 'A', t0);
      game = sayObject(game, by === 'owner' ? 'guest' : 'owner', round, 0, prompts('x'), t0);
    }
    // Rounds 1 and 3 the guest objected, round 2 the owner.
    expect(game.objectionsLeft).toEqual({ owner: 2, guest: 1 });
    const spent = { ...game, objectionsLeft: { owner: 0, guest: 1 } };
    const begun = sayBegin(spent, 'guest', t0);
    const claimed = sayClaim(begun, 'guest', 4, 0, 'A', t0);
    expect(mayObject(claimed, 'owner', t0)).toBe(false);
    expect(sayObject(claimed, 'owner', 4, 0, prompts('y'), t0)).toBe(claimed);
  });

  it('gives the round to the other table when the clock runs out', () => {
    const game = running('harf');
    expect(sayAdvance(game, prompts('Hayvan'), t0 + 9_999)).toBe(game);
    expect(sayAdvance(game, prompts('Hayvan'), t0 + 10_000)).toMatchObject({
      roundNo: 2,
      scores: { owner: 0, guest: 1 },
      lastRound: { winner: 'guest', reason: 'timeout' },
    });
  });

  it('gives the full board to the table that closed the last letter, after the window', () => {
    let game = running('harf');
    for (const [i, letter] of HARF_LETTERS.entries()) {
      game = sayClaim(game, game.turnTable, 1, i, letter, t0 + i);
    }
    const last = HARF_LETTERS.length - 1;
    // 23 letters: the owner table closed the last one.
    expect(game).toMatchObject({ step: 23, endsAt: t0 + last + 3_000 });
    expect(sayClaim(game, game.turnTable, 1, 23, 'A', t0 + last)).toBe(game);
    expect(sayAdvance(game, prompts('x'), t0 + last + 3_000)).toMatchObject({
      scores: { owner: 1, guest: 0 },
      lastRound: { winner: 'owner', reason: 'board' },
    });
  });

  it('ends after 5 categories with the scores; a tie has no winner', () => {
    let game = running('harf');
    for (let round = 1; round <= 5; round++) {
      game = sayBegin(game, game.turnTable, t0);
      game = sayAdvance(game, prompts('x'), t0 + 60_000);
    }
    expect(game).toMatchObject({ phase: 'finished', endsAt: null, roundNo: 5 });
    // Rounds 1, 3, 5 the owner started and lost; 2, 4 the guest.
    expect(game.scores).toEqual({ owner: 2, guest: 3 });
    expect(sayWinner(game)).toBe('guest');
    expect(sayWinner({ scores: { owner: 1, guest: 1 } })).toBeNull();
    expect(sayAdvance(game, prompts('x'), t0 + 999_999)).toBe(game);
  });
});

describe('Şarkıda Geçsin', () => {
  it('opens only the first word ready; the next words start at once with their starter', () => {
    const game = running('sarki');
    expect(game).toMatchObject({ prompt: 'aşk', letters: [], totalRounds: 8 });
    const next = sayAdvance(game, prompts('gece'), t0 + 10_000);
    expect(next).toMatchObject({
      roundNo: 2,
      prompt: 'gece',
      turnTable: 'guest',
      turnPhase: 'running',
      readyEndsAt: null,
      endsAt: t0 + 20_000,
    });
  });

  it('passes the turn on each line and ends the word without a point after the 8th', () => {
    let game = running('sarki');
    for (let step = 0; step < SAY_CONFIG.sarki.maxSteps; step++) {
      game = sayClaim(game, game.turnTable, 1, step, null, t0 + step);
    }
    expect(game).toMatchObject({ step: 8, endsAt: t0 + 7 + 3_000 });
    expect(game.lastClaim).toEqual({ table: 'guest', step: 7, letter: null });
    expect(sayClaim(game, game.turnTable, 1, 8, null, t0 + 8)).toBe(game);
    expect(sayAdvance(game, prompts('gece'), t0 + 10_007)).toMatchObject({
      roundNo: 2,
      scores: { owner: 0, guest: 0 },
      lastRound: { winner: null, reason: 'lines' },
    });
  });

  it('lets the 8th line be objected to', () => {
    let game = running('sarki');
    for (let step = 0; step < 8; step++) game = sayClaim(game, game.turnTable, 1, step, null, t0);
    expect(sayObject(game, 'owner', 1, 7, prompts('gece'), t0 + 1)).toMatchObject({
      scores: { owner: 1, guest: 0 },
      lastRound: { winner: 'owner', reason: 'objection' },
    });
  });

  it('gives the last two words 5 seconds a line', () => {
    let game = running('sarki');
    for (let round = 1; round <= 6; round++) {
      game = sayAdvance(game, prompts(`w${round + 1}`), (game.endsAt ?? 0) + 1);
    }
    expect(game.roundNo).toBe(7);
    const start = (game.endsAt ?? 0) - 5_000;
    expect(sayClaim(game, game.turnTable, 7, 0, null, start)).toMatchObject({
      endsAt: start + 5_000,
      objectionEndsAt: start + 3_000,
    });
  });
});
