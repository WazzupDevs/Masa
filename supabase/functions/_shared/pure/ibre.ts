// İbre (docs/SPEC_V3.md §20.5): a two-ended scale, a hidden target from 0 to 100, one spoken clue
// from the describing table, its needle, the other table's "Daha sol / Daha sağ" within 15 seconds,
// the bands 4 / 3 / 2 / 0 and 4 rounds with the tables in turn. Times are milliseconds. The SQL
// functions apply the same rules (private.ibre_config, private.ibre_band); integration tests check
// that they agree with this file. The one-table game runs it on the phone for Takım A (owner) and
// Takım B (guest), with the target made on the phone.

import type { TableSide } from './tabu.ts';

export const IBRE_CONFIG = {
  totalRounds: 4,
  readySeconds: 10,
  // The describing table's clock: the target, the clue and the needle.
  clueSeconds: 90,
  // The other table's "Daha sol / Daha sağ".
  sideSeconds: 15,
  minLocalPlayers: 2,
} as const;

export const IBRE_MIN = 0;
export const IBRE_MAX = 100;

export type IbreSide = 'left' | 'right';
export type IbreScale = { left: string; right: string };

// The bands by distance from the target (§20.5): 0-4 → 4, 5-11 → 3, 12-19 → 2, 20 and more → 0.
export function ibreBand(distance: number): number {
  const d = Math.abs(distance);
  return d <= 4 ? 4 : d <= 11 ? 3 : d <= 19 ? 2 : 0;
}

// The other table's guess is right when the target lies on that side of the needle; a needle right
// on the target gives no side point.
export function sideIsRight(target: number, needle: number, side: IbreSide): boolean {
  return needle !== target && (side === 'left') === target < needle;
}

// A target from 0 to 100 (the server's random(); the one-table game's Math.random).
export function randomTarget(random: () => number): number {
  return Math.min(IBRE_MAX, Math.floor(random() * (IBRE_MAX + 1)));
}

export type IbreReveal = {
  roundNo: number;
  // The round's scale (game_state.scale is the next round's by then).
  scale: IbreScale;
  // The describing table.
  table: TableSide;
  target: number;
  // Null: the clock ran out before the needle was locked.
  needle: number | null;
  band: number;
  side: IbreSide | null;
  sidePoint: boolean;
};

export type IbreState = {
  phase: 'playing' | 'finished';
  // ready: the scale, no clock; running: the describing table's clock; side: the other table's.
  turnPhase: 'ready' | 'running' | 'side';
  readyEndsAt: number | null;
  roundNo: number;
  totalRounds: number;
  scale: IbreScale;
  turnTable: TableSide;
  endsAt: number | null;
  // Set when the describing table locks it.
  needle: number | null;
  scores: Record<TableSide, number>;
  // Rounds a table scored 4, for game_completed (bullseyes).
  bullseyes: Record<TableSide, number>;
  // The last round's reveal, kept through the next round's ready state.
  reveal: IbreReveal | null;
};

export const otherSide = (side: TableSide): TableSide => (side === 'owner' ? 'guest' : 'owner');

// The describing table of round n: the owner's first, then in turn.
export function ibreTurnTable(roundNo: number): TableSide {
  return roundNo % 2 === 1 ? 'owner' : 'guest';
}

export function newIbreGame(scale: IbreScale, now: number): IbreState {
  return {
    phase: 'playing',
    turnPhase: 'ready',
    readyEndsAt: now + IBRE_CONFIG.readySeconds * 1000,
    roundNo: 1,
    totalRounds: IBRE_CONFIG.totalRounds,
    scale,
    turnTable: ibreTurnTable(1),
    endsAt: null,
    needle: null,
    scores: { owner: 0, guest: 0 },
    bullseyes: { owner: 0, guest: 0 },
    reveal: null,
  };
}

// The clock starts no later than readyEndsAt: a late Başla does not lengthen it (§20.1).
function started(game: IbreState, now: number): IbreState {
  const from = Math.min(now, game.readyEndsAt ?? now);
  return {
    ...game,
    turnPhase: 'running',
    readyEndsAt: null,
    endsAt: from + IBRE_CONFIG.clueSeconds * 1000,
  };
}

// Başla: the describing table only. Anything else leaves the game as it is.
export function ibreBegin(game: IbreState, by: TableSide, now: number): IbreState {
  if (game.phase !== 'playing' || game.turnPhase !== 'ready' || by !== game.turnTable) return game;
  return started(game, now);
}

// The describing table locks its needle (0-100) on round `round` before its clock runs out; the
// other table's 15 seconds start. A stale or second call is ignored.
export function ibreLock(
  game: IbreState,
  by: TableSide,
  round: number,
  value: number,
  now: number,
): IbreState {
  if (game.phase !== 'playing' || game.turnPhase !== 'running') return game;
  if (by !== game.turnTable || round !== game.roundNo || now >= (game.endsAt ?? 0)) return game;
  if (!Number.isInteger(value) || value < IBRE_MIN || value > IBRE_MAX) return game;
  return {
    ...game,
    turnPhase: 'side',
    needle: value,
    endsAt: now + IBRE_CONFIG.sideSeconds * 1000,
  };
}

// "Daha sol / Daha sağ": the other table, within its 15 seconds. The round is revealed at once.
export function ibreSide(
  game: IbreState,
  by: TableSide,
  round: number,
  side: IbreSide,
  target: number,
  nextScale: () => IbreScale,
  now: number,
): IbreState {
  if (game.phase !== 'playing' || game.turnPhase !== 'side') return game;
  if (by === game.turnTable || round !== game.roundNo || now >= (game.endsAt ?? 0)) return game;
  return endRound(game, target, side, nextScale, now);
}

// Either table, once a clock ran out: the ready clock starts the turn (from readyEndsAt), the
// describing table's clock ends the round without a needle (no points), the other table's ends it
// without a side guess. Before that: the game as it is.
export function ibreAdvance(
  game: IbreState,
  target: number,
  nextScale: () => IbreScale,
  now: number,
): IbreState {
  if (game.phase !== 'playing') return game;
  if (game.turnPhase === 'ready') {
    return now >= (game.readyEndsAt ?? Number.POSITIVE_INFINITY) ? started(game, now) : game;
  }
  if (now < (game.endsAt ?? Number.POSITIVE_INFINITY)) return game;
  return endRound(game, target, null, nextScale, now);
}

function endRound(
  game: IbreState,
  target: number,
  side: IbreSide | null,
  nextScale: () => IbreScale,
  now: number,
): IbreState {
  const describer = game.turnTable;
  const guesser = otherSide(describer);
  const needle = game.turnPhase === 'side' ? game.needle : null;
  const band = needle === null ? 0 : ibreBand(needle - target);
  const sidePoint = needle !== null && side !== null && sideIsRight(target, needle, side);
  const scores = {
    ...game.scores,
    [describer]: game.scores[describer] + band,
    [guesser]: game.scores[guesser] + (sidePoint ? 1 : 0),
  } as Record<TableSide, number>;
  const bullseyes = {
    ...game.bullseyes,
    [describer]: game.bullseyes[describer] + (band === 4 ? 1 : 0),
  } as Record<TableSide, number>;
  const reveal: IbreReveal = {
    roundNo: game.roundNo,
    scale: game.scale,
    table: describer,
    target,
    needle,
    band,
    side,
    sidePoint,
  };
  if (game.roundNo >= game.totalRounds) {
    return {
      ...game,
      phase: 'finished',
      endsAt: null,
      needle,
      scores,
      bullseyes,
      reveal,
    };
  }
  const roundNo = game.roundNo + 1;
  return {
    ...game,
    turnPhase: 'ready',
    readyEndsAt: now + IBRE_CONFIG.readySeconds * 1000,
    roundNo,
    scale: nextScale(),
    turnTable: ibreTurnTable(roundNo),
    endsAt: null,
    needle: null,
    scores,
    bullseyes,
    reveal,
  };
}

// The app locks the needle where it stands when the describing table has not by the last 3 seconds
// of its clock (the owner's rule; the server still scores an unlocked needle 0). A phone in the
// background sends nothing, so its round stays at 0.
export const IBRE_AUTO_LOCK_SECONDS = 3;

export function ibreAutoLockDue(game: IbreState, now: number): boolean {
  return (
    game.phase === 'playing' &&
    game.turnPhase === 'running' &&
    game.endsAt !== null &&
    now >= game.endsAt - IBRE_AUTO_LOCK_SECONDS * 1000 &&
    now < game.endsAt
  );
}

export function ibreWinner(game: Pick<IbreState, 'scores'>): TableSide | null {
  const { owner, guest } = game.scores;
  return owner === guest ? null : owner > guest ? 'owner' : 'guest';
}

// ---------------------------------------------------------------------------------------------
// The two-table game as the app reads it from rooms.game_state; the clocks become milliseconds.
// The target is not there before the reveal (rule 4); only `reveal` carries it.

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isSide = (v: unknown): v is TableSide => v === 'owner' || v === 'guest';
const time = (v: unknown): number | null => (typeof v === 'string' ? Date.parse(v) : null);
const pair = (v: unknown): Record<TableSide, number> | null =>
  isObj(v) && isInt(v.owner) && isInt(v.guest) ? { owner: v.owner, guest: v.guest } : null;

export function parseIbreReveal(v: unknown): IbreReveal | null {
  const scale = isObj(v) ? v.scale : null;
  if (
    !isObj(v) ||
    !isInt(v.roundNo) ||
    !isSide(v.table) ||
    !isInt(v.target) ||
    !isInt(v.band) ||
    !isObj(scale) ||
    typeof scale.left !== 'string' ||
    typeof scale.right !== 'string'
  ) {
    return null;
  }
  return {
    roundNo: v.roundNo,
    scale: { left: scale.left, right: scale.right },
    table: v.table,
    target: v.target,
    needle: isInt(v.needle) ? v.needle : null,
    band: v.band,
    side: v.side === 'left' || v.side === 'right' ? v.side : null,
    sidePoint: v.sidePoint === true,
  };
}

export function parseIbreState(value: unknown): IbreState | null {
  if (!isObj(value) || value.concept !== 'ibre') return null;
  const v = value;
  const scores = pair(v.scores);
  const bullseyes = pair(v.bullseyes);
  const scale = v.scale;
  if (
    v.phase !== 'playing' ||
    (v.turnPhase !== 'ready' && v.turnPhase !== 'running' && v.turnPhase !== 'side') ||
    !isInt(v.roundNo) ||
    !isInt(v.totalRounds) ||
    !isObj(scale) ||
    typeof scale.left !== 'string' ||
    typeof scale.right !== 'string' ||
    !isSide(v.turnTable) ||
    !scores ||
    !bullseyes
  ) {
    return null;
  }
  return {
    phase: 'playing',
    turnPhase: v.turnPhase,
    readyEndsAt: time(v.readyEndsAt),
    roundNo: v.roundNo,
    totalRounds: v.totalRounds,
    scale: { left: scale.left, right: scale.right },
    turnTable: v.turnTable,
    endsAt: time(v.endsAt),
    needle: isInt(v.needle) ? v.needle : null,
    scores,
    bullseyes,
    reveal: parseIbreReveal(v.reveal),
  };
}
