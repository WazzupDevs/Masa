import { describe, expect, it } from 'vitest';

import {
  IBRE_CONFIG,
  ibreAdvance,
  ibreBand,
  ibreBegin,
  ibreLock,
  ibreSide,
  type IbreState,
  ibreTurnTable,
  ibreWinner,
  newIbreGame,
  parseIbreState,
  randomTarget,
  sideIsRight,
} from './ibre.ts';

const t0 = Date.parse('2026-10-06T12:00:00Z');
const scale = { left: 'Ucuz', right: 'Pahalı' };
const scales = () => {
  let i = 0;
  return () => ({ left: `L${++i}`, right: `R${i}` });
};

function locked(value: number, now = t0): IbreState {
  const running = ibreBegin(newIbreGame(scale, now), 'owner', now);
  return ibreLock(running, 'owner', 1, value, now + 1_000);
}

describe('the bands', () => {
  it('gives 4, 3, 2 or 0 by distance, the same on both sides', () => {
    const at = (d: number) => [ibreBand(d), ibreBand(-d)];
    expect([0, 4, 5, 11, 12, 19, 20, 100].map(at)).toEqual([
      [4, 4],
      [4, 4],
      [3, 3],
      [3, 3],
      [2, 2],
      [2, 2],
      [0, 0],
      [0, 0],
    ]);
  });

  it('judges the side from the needle; right on the target is no side point', () => {
    expect(sideIsRight(30, 41, 'left')).toBe(true);
    expect(sideIsRight(30, 41, 'right')).toBe(false);
    expect(sideIsRight(60, 41, 'right')).toBe(true);
    expect(sideIsRight(41, 41, 'left')).toBe(false);
    expect(sideIsRight(41, 41, 'right')).toBe(false);
  });

  it('makes targets from 0 to 100', () => {
    expect([0, 0.5, 0.999999].map((r) => randomTarget(() => r))).toEqual([0, 50, 100]);
  });
});

describe('a round', () => {
  it('opens ready for the owner table; Başla from it only', () => {
    const game = newIbreGame(scale, t0);
    expect(game).toMatchObject({
      turnPhase: 'ready',
      readyEndsAt: t0 + 10_000,
      turnTable: 'owner',
      roundNo: 1,
      totalRounds: 4,
      needle: null,
    });
    expect(ibreBegin(game, 'guest', t0 + 1_000)).toBe(game);
    expect(ibreBegin(game, 'owner', t0 + 1_000)).toMatchObject({
      turnPhase: 'running',
      endsAt: t0 + 1_000 + IBRE_CONFIG.clueSeconds * 1000,
    });
  });

  it('starts the clock from readyEndsAt, however late the call', () => {
    const game = newIbreGame(scale, t0);
    expect(ibreAdvance(game, 50, scales(), t0 + 9_999)).toBe(game);
    const fromReady = t0 + 10_000 + IBRE_CONFIG.clueSeconds * 1000;
    expect(ibreAdvance(game, 50, scales(), t0 + 25_000)).toMatchObject({
      turnPhase: 'running',
      endsAt: fromReady,
    });
    expect(ibreBegin(game, 'owner', t0 + 25_000)).toMatchObject({ endsAt: fromReady });
  });

  it('locks the describing table’s needle once, then gives the other table 15 seconds', () => {
    const running = ibreBegin(newIbreGame(scale, t0), 'owner', t0);
    const game = ibreLock(running, 'owner', 1, 41, t0 + 5_000);
    expect(game).toMatchObject({ turnPhase: 'side', needle: 41, endsAt: t0 + 20_000 });
    // The other table, a stale round, a second lock, a value off the scale, after the clock.
    expect(ibreLock(running, 'guest', 1, 41, t0)).toBe(running);
    expect(ibreLock(running, 'owner', 2, 41, t0)).toBe(running);
    expect(ibreLock(game, 'owner', 1, 60, t0 + 6_000)).toBe(game);
    expect(ibreLock(running, 'owner', 1, 101, t0)).toBe(running);
    expect(ibreLock(running, 'owner', 1, 40.5, t0)).toBe(running);
    expect(ibreLock(running, 'owner', 1, 41, t0 + IBRE_CONFIG.clueSeconds * 1000)).toBe(running);
  });

  it('reveals on the side guess: the band for the describer, 1 for a right side', () => {
    const game = locked(41);
    expect(ibreSide(game, 'owner', 1, 'left', 34, scales(), t0 + 2_000)).toBe(game);
    expect(ibreSide(game, 'guest', 2, 'left', 34, scales(), t0 + 2_000)).toBe(game);
    expect(ibreSide(game, 'guest', 1, 'left', 34, scales(), t0 + 16_000)).toBe(game);
    const next = ibreSide(game, 'guest', 1, 'left', 34, scales(), t0 + 2_000);
    expect(next).toMatchObject({
      roundNo: 2,
      turnTable: 'guest',
      turnPhase: 'ready',
      readyEndsAt: t0 + 12_000,
      scale: { left: 'L1', right: 'R1' },
      needle: null,
      scores: { owner: 3, guest: 1 },
      bullseyes: { owner: 0, guest: 0 },
      reveal: {
        roundNo: 1,
        scale: { left: 'Ucuz', right: 'Pahalı' },
        table: 'owner',
        target: 34,
        needle: 41,
        band: 3,
        side: 'left',
        sidePoint: true,
      },
    });
  });

  it('counts a bullseye; a wrong side scores nothing', () => {
    const next = ibreSide(locked(50), 'guest', 1, 'right', 47, scales(), t0 + 2_000);
    expect(next.scores).toEqual({ owner: 4, guest: 0 });
    expect(next.bullseyes).toEqual({ owner: 1, guest: 0 });
  });

  it('ends the round without a side guess when the other table’s clock runs out', () => {
    const game = locked(41);
    expect(ibreAdvance(game, 70, scales(), t0 + 15_999)).toBe(game);
    expect(ibreAdvance(game, 70, scales(), t0 + 16_000)).toMatchObject({
      roundNo: 2,
      scores: { owner: 0, guest: 0 },
      reveal: { target: 70, needle: 41, band: 0, side: null, sidePoint: false },
    });
  });

  it('ends the round without points when the describing table never locks', () => {
    const running = ibreBegin(newIbreGame(scale, t0), 'owner', t0);
    const end = t0 + IBRE_CONFIG.clueSeconds * 1000;
    expect(ibreAdvance(running, 34, scales(), end - 1)).toBe(running);
    expect(ibreAdvance(running, 34, scales(), end)).toMatchObject({
      roundNo: 2,
      scores: { owner: 0, guest: 0 },
      reveal: { target: 34, needle: null, band: 0, side: null },
    });
  });
});

describe('the game', () => {
  it('plays 4 rounds with the tables in turn, then ends with the scores', () => {
    expect([1, 2, 3, 4].map(ibreTurnTable)).toEqual(['owner', 'guest', 'owner', 'guest']);
    let game = newIbreGame(scale, t0);
    for (let round = 1; round <= 4; round++) {
      const by = game.turnTable;
      game = ibreBegin(game, by, t0);
      game = ibreLock(game, by, round, 50, t0);
      game = ibreSide(game, by === 'owner' ? 'guest' : 'owner', round, 'left', 40, scales(), t0);
    }
    // Every round: 3 for the describer, 1 for the right side.
    expect(game).toMatchObject({
      phase: 'finished',
      endsAt: null,
      roundNo: 4,
      scores: { owner: 8, guest: 8 },
      reveal: { roundNo: 4, table: 'guest' },
    });
    expect(ibreWinner(game)).toBeNull();
    expect(ibreWinner({ scores: { owner: 2, guest: 5 } })).toBe('guest');
    expect(ibreAdvance(game, 40, scales(), t0 + 999_999)).toBe(game);
  });
});

describe('the app reading game_state', () => {
  it('reads a game with its clocks and the reveal, and refuses anything else', () => {
    const gs = {
      concept: 'ibre',
      phase: 'playing',
      gameNo: 1,
      turnPhase: 'side',
      readyEndsAt: null,
      roundNo: 2,
      totalRounds: 4,
      scale: { left: 'Sessiz', right: 'Gürültülü' },
      turnTable: 'guest',
      endsAt: '2026-10-06T12:00:15Z',
      needle: 41,
      scores: { owner: 3, guest: 1 },
      bullseyes: { owner: 0, guest: 0 },
      reveal: {
        roundNo: 1,
        scale: { left: 'Ucuz', right: 'Pahalı' },
        table: 'owner',
        target: 34,
        needle: 41,
        band: 3,
        side: 'left',
        sidePoint: true,
      },
    };
    expect(parseIbreState(gs)).toMatchObject({
      turnPhase: 'side',
      endsAt: Date.parse('2026-10-06T12:00:15Z'),
      needle: 41,
      scale: { left: 'Sessiz', right: 'Gürültülü' },
      reveal: { target: 34, sidePoint: true },
    });
    expect(parseIbreState({ ...gs, concept: 'harf' })).toBeNull();
    expect(parseIbreState({ ...gs, turnPhase: 'x' })).toBeNull();
    expect(parseIbreState({ ...gs, reveal: null })?.reveal).toBeNull();
    expect(parseIbreState({ ...gs, needle: null })?.needle).toBeNull();
  });
});
