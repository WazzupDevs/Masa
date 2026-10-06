// The engine Harf Kapmaca and Şarkıda Geçsin share (docs/SPEC_V3.md §20.3–20.4): a prompt (a
// category with a letter board, or a word), whose turn it is, the 10-second clock, "Söyledik" (a
// letter claimed or a line sung), the other table's 3-second objection window with 3 objections per
// game, the lost round and the point. Times are milliseconds. The SQL functions apply the same rules
// (private.say_config); integration tests check that they agree with this file. The one-table game
// runs it on the phone for Takım A (owner) and Takım B (guest).

import type { TableSide } from './tabu.ts';

export type SayKind = 'harf' | 'sarki';

// The board: the Turkish alphabet without Ğ, I, J, Ö, Ü, V (few words start with them).
export const HARF_LETTERS = [
  'A',
  'B',
  'C',
  'Ç',
  'D',
  'E',
  'F',
  'G',
  'H',
  'İ',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'R',
  'S',
  'Ş',
  'T',
  'U',
  'Y',
  'Z',
] as const;

export const SAY_CONFIG = {
  harf: {
    totalRounds: 5,
    turnSeconds: 10,
    shortRounds: 0,
    shortSeconds: 10,
    objectionSeconds: 3,
    objections: 3,
    readySeconds: 10,
    // The ready state opens every round (each category), not only the first.
    readyEachRound: true,
    maxSteps: HARF_LETTERS.length,
    minLocalPlayers: 2,
  },
  sarki: {
    totalRounds: 8,
    turnSeconds: 10,
    // The last two words: 5 seconds a line.
    shortRounds: 2,
    shortSeconds: 5,
    objectionSeconds: 3,
    objections: 3,
    readySeconds: 10,
    readyEachRound: false,
    // At most 8 lines a word; the 8th, if not objected to, ends the word without a point.
    maxSteps: 8,
    minLocalPlayers: 2,
  },
} as const;

export type RoundEnd = 'objection' | 'timeout' | 'board' | 'lines';

export type SayState = {
  kind: SayKind;
  phase: 'playing' | 'finished';
  turnPhase: 'ready' | 'running';
  readyEndsAt: number | null;
  roundNo: number;
  totalRounds: number;
  // The category (Harf Kapmaca) or the word (Şarkıda Geçsin); open to both tables.
  prompt: string;
  // Harf Kapmaca's board; empty in Şarkıda Geçsin.
  letters: { letter: string; closed: boolean }[];
  turnTable: TableSide;
  step: number;
  endsAt: number | null;
  objectionEndsAt: number | null;
  lastClaim: { table: TableSide; step: number; letter: string | null } | null;
  objectionsLeft: Record<TableSide, number>;
  scores: Record<TableSide, number>;
  lastRound: { roundNo: number; winner: TableSide | null; reason: RoundEnd } | null;
  // Rounds lost on the clock, for game_completed (rounds_lost_by_timeout).
  timeouts: number;
};

export const otherSide = (side: TableSide): TableSide => (side === 'owner' ? 'guest' : 'owner');

// The table that opens round n: the owner's first, then in turn.
export function roundStarter(roundNo: number): TableSide {
  return roundNo % 2 === 1 ? 'owner' : 'guest';
}

// Seconds a turn gets in round n (Şarkıda Geçsin's last two words are shorter).
export function turnSeconds(kind: SayKind, roundNo: number): number {
  const c = SAY_CONFIG[kind];
  return roundNo > c.totalRounds - c.shortRounds ? c.shortSeconds : c.turnSeconds;
}

function board(kind: SayKind): SayState['letters'] {
  return kind === 'harf' ? HARF_LETTERS.map((letter) => ({ letter, closed: false })) : [];
}

export function newSayGame(kind: SayKind, prompt: string, now: number): SayState {
  const c = SAY_CONFIG[kind];
  return {
    kind,
    phase: 'playing',
    turnPhase: 'ready',
    readyEndsAt: now + c.readySeconds * 1000,
    roundNo: 1,
    totalRounds: c.totalRounds,
    prompt,
    letters: board(kind),
    turnTable: roundStarter(1),
    step: 0,
    endsAt: null,
    objectionEndsAt: null,
    lastClaim: null,
    objectionsLeft: { owner: c.objections, guest: c.objections },
    scores: { owner: 0, guest: 0 },
    lastRound: null,
    timeouts: 0,
  };
}

// The round is over: the point (if any), then the next prompt, or the end of the game.
function endRound(
  game: SayState,
  winner: TableSide | null,
  reason: RoundEnd,
  nextPrompt: () => string,
  now: number,
): SayState {
  const scores = winner ? { ...game.scores, [winner]: game.scores[winner] + 1 } : game.scores;
  const lastRound = { roundNo: game.roundNo, winner, reason };
  const timeouts = game.timeouts + (reason === 'timeout' ? 1 : 0);
  if (game.roundNo >= game.totalRounds) {
    return {
      ...game,
      phase: 'finished',
      endsAt: null,
      objectionEndsAt: null,
      readyEndsAt: null,
      scores,
      lastRound,
      timeouts,
    };
  }
  const c = SAY_CONFIG[game.kind];
  const roundNo = game.roundNo + 1;
  const ready = c.readyEachRound;
  return {
    ...game,
    roundNo,
    prompt: nextPrompt(),
    letters: board(game.kind),
    turnTable: roundStarter(roundNo),
    step: 0,
    turnPhase: ready ? 'ready' : 'running',
    readyEndsAt: ready ? now + c.readySeconds * 1000 : null,
    endsAt: ready ? null : now + turnSeconds(game.kind, roundNo) * 1000,
    objectionEndsAt: null,
    lastClaim: null,
    scores,
    lastRound,
    timeouts,
  };
}

// Başla: the starting table at any time, either table once readyEndsAt has passed.
export function sayBegin(game: SayState, by: TableSide, now: number): SayState {
  if (game.phase !== 'playing' || game.turnPhase !== 'ready') return game;
  if (by !== game.turnTable && now < (game.readyEndsAt ?? 0)) return game;
  return {
    ...game,
    turnPhase: 'running',
    readyEndsAt: null,
    endsAt: now + turnSeconds(game.kind, game.roundNo) * 1000,
  };
}

// The steps are used up: all letters closed, or the 8th line sung.
function stepsUsed(game: SayState): boolean {
  return game.kind === 'harf'
    ? game.letters.every((l) => l.closed)
    : game.step >= SAY_CONFIG.sarki.maxSteps;
}

// Söyledik: the table whose turn it is names a word for an open letter (Harf Kapmaca) or sings a
// line (Şarkıda Geçsin) on step `step` of round `round`. A stale or second call is ignored.
export function sayClaim(
  game: SayState,
  by: TableSide,
  round: number,
  step: number,
  letter: string | null,
  now: number,
): SayState {
  if (game.phase !== 'playing' || game.turnPhase !== 'running') return game;
  if (round !== game.roundNo || step !== game.step || by !== game.turnTable) return game;
  if (now >= (game.endsAt ?? 0) || stepsUsed(game)) return game;
  let letters = game.letters;
  if (game.kind === 'harf') {
    const at = letters.findIndex((l) => l.letter === letter && !l.closed);
    if (at < 0) return game;
    letters = letters.map((l, i) => (i === at ? { ...l, closed: true } : l));
  }
  const c = SAY_CONFIG[game.kind];
  const objectionEndsAt = now + c.objectionSeconds * 1000;
  const next: SayState = {
    ...game,
    letters,
    step: game.step + 1,
    turnTable: otherSide(by),
    lastClaim: { table: by, step, letter: game.kind === 'harf' ? letter : null },
    objectionEndsAt,
    endsAt: now + turnSeconds(game.kind, game.roundNo) * 1000,
  };
  // Nothing left to claim: only the objection window remains, then advance settles the round.
  return stepsUsed(next) ? { ...next, endsAt: objectionEndsAt } : next;
}

// İtiraz: the other table, inside the window, with an objection left. The claiming table loses the
// round; the objecting table gets the point.
export function sayObject(
  game: SayState,
  by: TableSide,
  round: number,
  step: number,
  nextPrompt: () => string,
  now: number,
): SayState {
  const claim = game.lastClaim;
  if (game.phase !== 'playing' || game.turnPhase !== 'running' || !claim) return game;
  if (round !== game.roundNo || step !== claim.step || by === claim.table) return game;
  if (now >= (game.objectionEndsAt ?? 0) || game.objectionsLeft[by] <= 0) return game;
  const objected = {
    ...game,
    objectionsLeft: { ...game.objectionsLeft, [by]: game.objectionsLeft[by] - 1 },
  };
  return endRound(objected, by, 'objection', nextPrompt, now);
}

// The clock ran out (either table): the table whose turn it was loses the round. With the steps
// used up, the board goes to the table that closed the last letter, and the 8th line ends the word
// without a point.
export function sayAdvance(game: SayState, nextPrompt: () => string, now: number): SayState {
  if (game.phase !== 'playing' || game.turnPhase !== 'running') return game;
  if (now < (game.endsAt ?? Number.POSITIVE_INFINITY)) return game;
  if (stepsUsed(game)) {
    return game.kind === 'harf'
      ? endRound(game, game.lastClaim?.table ?? null, 'board', nextPrompt, now)
      : endRound(game, null, 'lines', nextPrompt, now);
  }
  return endRound(game, otherSide(game.turnTable), 'timeout', nextPrompt, now);
}

// May `by` object now? (The button's state on the phone.)
export function mayObject(game: SayState, by: TableSide, now: number): boolean {
  const claim = game.lastClaim;
  return (
    game.phase === 'playing' &&
    game.turnPhase === 'running' &&
    !!claim &&
    claim.table !== by &&
    now < (game.objectionEndsAt ?? 0) &&
    game.objectionsLeft[by] > 0
  );
}

export function sayWinner(game: Pick<SayState, 'scores'>): TableSide | null {
  const { owner, guest } = game.scores;
  return owner === guest ? null : owner > guest ? 'owner' : 'guest';
}

// ---------------------------------------------------------------------------------------------
// The two-table game as the app reads it from rooms.game_state; the clocks become milliseconds.

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isSide = (v: unknown): v is TableSide => v === 'owner' || v === 'guest';
const time = (v: unknown): number | null => (typeof v === 'string' ? Date.parse(v) : null);
const pair = (v: unknown): Record<TableSide, number> | null =>
  isObj(v) && isInt(v.owner) && isInt(v.guest) ? { owner: v.owner, guest: v.guest } : null;
const REASONS: readonly RoundEnd[] = ['objection', 'timeout', 'board', 'lines'];

export function parseSayState(value: unknown): SayState | null {
  if (!isObj(value) || (value.concept !== 'harf' && value.concept !== 'sarki')) return null;
  const v = value;
  const scores = pair(v.scores);
  const objectionsLeft = pair(v.objectionsLeft);
  if (
    v.phase !== 'playing' ||
    (v.turnPhase !== 'ready' && v.turnPhase !== 'running') ||
    !isInt(v.roundNo) ||
    !isInt(v.totalRounds) ||
    typeof v.prompt !== 'string' ||
    !Array.isArray(v.letters) ||
    !isSide(v.turnTable) ||
    !isInt(v.step) ||
    !scores ||
    !objectionsLeft
  ) {
    return null;
  }
  const claim = v.lastClaim;
  const round = v.lastRound;
  return {
    kind: v.concept as SayKind,
    phase: 'playing',
    turnPhase: v.turnPhase,
    readyEndsAt: time(v.readyEndsAt),
    roundNo: v.roundNo,
    totalRounds: v.totalRounds,
    prompt: v.prompt,
    letters: v.letters
      .filter(isObj)
      .map((l) => ({ letter: String(l.letter), closed: l.closed === true })),
    turnTable: v.turnTable,
    step: v.step,
    endsAt: time(v.endsAt),
    objectionEndsAt: time(v.objectionEndsAt),
    lastClaim:
      isObj(claim) && isSide(claim.table) && isInt(claim.step)
        ? {
            table: claim.table,
            step: claim.step,
            letter: typeof claim.letter === 'string' ? claim.letter : null,
          }
        : null,
    objectionsLeft,
    scores,
    lastRound:
      isObj(round) && isInt(round.roundNo) && REASONS.includes(round.reason as RoundEnd)
        ? {
            roundNo: round.roundNo,
            winner: isSide(round.winner) ? round.winner : null,
            reason: round.reason as RoundEnd,
          }
        : null,
    timeouts: isInt(v.timeouts) ? v.timeouts : 0,
  };
}
