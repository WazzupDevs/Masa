// Tabu rules (MVP_SPEC §5.1, docs/SPEC_V2.md §8.2). The SQL functions receive the numbers from
// here and apply the same rules as applyMark; the integration tests check that they agree.
import type { SohbetState, SohbetTheme } from './sohbet.ts';
import { SOHBET_THEMES } from './sohbet.ts';
import { parseSahtekarLastGame, type SahtekarLastGame } from './sahtekar.ts';
import { SAY_CONFIG } from './sayChallenge.ts';

export const TABU = {
  turnSeconds: 60,
  totalTurns: 6,
  maxPasses: 3,
  // Cards dealt to a turn at once (both tables get the list at the start of the turn). A fast
  // table closes a card every ~2 seconds, so 40 cover a 60 second turn.
  cardsPerTurn: 40,
  // Two-table turns open ready (docs/SPEC_V3.md §19.1): the describing table presses Başla; after
  // this many seconds either table may start the clock. private.tabu_ready_seconds() in SQL.
  readySeconds: 15,
  // One-table game (§5.1): teams A and B, 3 rounds each.
  localRoundsPerTeam: 3,
  localDeckSize: 120,
} as const;

export type TabuCard = { word: string; forbidden: readonly string[] };

// Two-table Tabu, face to face (docs/SPEC_V2.md §8.2, docs/SPEC_V3.md §6). The mode is set for the
// whole game from the two headcounts (S3):
// - refereed: team = table, one score per table; the card list goes to both tables, the other
//   table judges.
// - cooperative: one team, one score against the clock; only the describing table gets the card
//   list (tabu/turn-cards answers the guessing table `not_describer`) and presses all three.
// rooms.game_state never holds the card being played.
export type TableSide = 'owner' | 'guest';

export const TABU_MODES = ['refereed', 'cooperative'] as const;
export type TabuMode = (typeof TABU_MODES)[number];

// A one-person table has no teammate to guess its describer: the whole game is cooperative.
export function tabuMode(ownerHeadcount: number, guestHeadcount: number): TabuMode {
  return Math.min(ownerHeadcount, guestHeadcount) <= 1 ? 'cooperative' : 'refereed';
}

type TabuStateBase = {
  concept: 'tabu';
  phase: 'playing' | 'finished';
  gameNo: number;
  turnNo: number;
  totalTurns: number;
  turnSeconds: number;
  cardsPerTurn: number;
  describingTable: TableSide;
  // A turn opens ready (docs/SPEC_V3.md §19.1): no clock until tabu/begin-turn. turnEndsAt is set
  // once it runs; readyEndsAt and lastTurn only while it is ready.
  turnPhase: TurnPhase;
  turnEndsAt: string | null;
  readyEndsAt: string | null;
  lastTurn: TurnSummary | null;
  passesUsed: number;
  maxPasses: number;
  // Index of the card being played in this turn's list.
  cardIndex: number;
};

export type RefereedTabuState = TabuStateBase & {
  mode: 'refereed';
  scores: Record<TableSide, number>;
};

export type CooperativeTabuState = TabuStateBase & {
  mode: 'cooperative';
  scores: { team: number };
};

export type VoiceTabuState = RefereedTabuState | CooperativeTabuState;

export const MARK_RESULTS = ['correct', 'taboo', 'pass'] as const;
export type MarkResult = (typeof MARK_RESULTS)[number];
// Points for the describing table (cooperative: the team): Doğru +1, Tabu −1, Pas 0.
export const MARK_POINTS: Record<MarkResult, number> = { correct: 1, taboo: -1, pass: 0 };

// A table's role in the current turn: the other table judges (refereed) or guesses (cooperative).
export type TableRole = 'describer' | 'judge' | 'guesser';

// Refereed: Tabu only the judging table, Pas only the describing table, Doğru either.
// Cooperative: the describing table presses all three, the guessing table none.
export function mayMark(role: TableRole, result: MarkResult): boolean {
  if (role === 'guesser') return false;
  if (result === 'taboo') return role === 'judge';
  if (result === 'pass') return role === 'describer';
  return true;
}

// The same, for the mode the role belongs to: a cooperative describer may also press Tabu.
function mayMarkIn(mode: TabuMode, role: TableRole, result: MarkResult): boolean {
  return mode === 'cooperative' ? role === 'describer' : mayMark(role, result);
}

function rejection(role: TableRole, result: MarkResult): 'not_judge' | 'not_describer' {
  return role !== 'guesser' && result === 'taboo' ? 'not_judge' : 'not_describer';
}

export type Mark = { turnNo: number; cardIndex: number; result: MarkResult };

export type MarkOutcome =
  | { kind: 'applied'; state: VoiceTabuState }
  // Another turn, a card already closed, a card ahead of this state, or past the list: the same
  // card is never counted twice and the server's order wins.
  | { kind: 'ignored' }
  | {
      kind: 'rejected';
      reason:
        | 'no_game'
        | 'not_judge'
        | 'not_describer'
        | 'turn_not_started'
        | 'turn_over'
        | 'no_passes_left';
    };

export function applyMark(
  state: VoiceTabuState,
  mark: Mark,
  role: TableRole,
  now: number,
): MarkOutcome {
  if (state.phase !== 'playing') return { kind: 'rejected', reason: 'no_game' };
  if (!mayMarkIn(state.mode, role, mark.result)) {
    return { kind: 'rejected', reason: rejection(role, mark.result) };
  }
  if (
    mark.turnNo !== state.turnNo ||
    mark.cardIndex !== state.cardIndex ||
    mark.cardIndex >= state.cardsPerTurn
  ) {
    return { kind: 'ignored' };
  }
  if (state.turnPhase === 'ready' || state.turnEndsAt === null) {
    return { kind: 'rejected', reason: 'turn_not_started' };
  }
  if (now >= Date.parse(state.turnEndsAt)) return { kind: 'rejected', reason: 'turn_over' };
  if (mark.result === 'pass' && state.passesUsed >= state.maxPasses) {
    return { kind: 'rejected', reason: 'no_passes_left' };
  }
  const points = MARK_POINTS[mark.result];
  const moved = {
    passesUsed: state.passesUsed + (mark.result === 'pass' ? 1 : 0),
    cardIndex: state.cardIndex + 1,
  };
  if (state.mode === 'cooperative') {
    return {
      kind: 'applied',
      state: { ...state, ...moved, scores: { team: state.scores.team + points } },
    };
  }
  const side = state.describingTable;
  return {
    kind: 'applied',
    state: { ...state, ...moved, scores: { ...state.scores, [side]: state.scores[side] + points } },
  };
}

// What the pressing phone shows: the server's state with its own presses the server has not
// confirmed yet laid on top, in order. Presses the server has moved past drop out, so when the
// two tables pressed on the same card, the server's result stands.
export function optimisticView(
  server: VoiceTabuState,
  pending: readonly Mark[],
  role: TableRole,
  now: number,
): VoiceTabuState {
  let view = server;
  for (const mark of pending) {
    const outcome = applyMark(view, mark, role, now);
    if (outcome.kind === 'applied') view = outcome.state;
  }
  return view;
}

// Presses still worth sending or keeping after the server state moved.
export function pendingAfter(server: VoiceTabuState, pending: readonly Mark[]): Mark[] {
  return pending.filter((m) => m.turnNo === server.turnNo && m.cardIndex >= server.cardIndex);
}

// Tables take turns: odd turns the owner's table describes, even turns the guest's.
export function describingTableForTurn(turnNo: number): TableSide {
  return turnNo % 2 === 1 ? 'owner' : 'guest';
}

export function roleOf(state: VoiceTabuState, side: TableSide): TableRole {
  if (state.describingTable === side) return 'describer';
  return state.mode === 'cooperative' ? 'guesser' : 'judge';
}

// Ready turns (docs/SPEC_V3.md §19.1). game_state.turnPhase is 'ready' until tabu/begin-turn
// starts the clock; a state without it (a game started before §19.1) is running.
export type TurnPhase = 'ready' | 'running';

// The previous turn on the ready screen: its score and how its cards closed.
export type TurnSummary = {
  turnNo: number;
  describingTable: TableSide;
  score: number;
  correct: number;
  taboo: number;
  pass: number;
};

export function summarizeTurn(
  turnNo: number,
  describingTable: TableSide,
  results: readonly MarkResult[],
): TurnSummary {
  const count = (r: MarkResult) => results.filter((x) => x === r).length;
  return {
    turnNo,
    describingTable,
    score: results.reduce((sum, r) => sum + MARK_POINTS[r], 0),
    correct: count('correct'),
    taboo: count('taboo'),
    pass: count('pass'),
  };
}

export type ReadyTurn = { readyEndsAt: string; lastTurn: TurnSummary | null };

// The ready part of a two-table Tabu game_state, or null when the turn runs.
export function parseReadyTurn(value: unknown): ReadyTurn | null {
  if (!isRecord(value) || value.concept !== 'tabu' || value.turnPhase !== 'ready') return null;
  if (!str(value.readyEndsAt)) return null;
  const last = value.lastTurn;
  const lastTurn: TurnSummary | null =
    isRecord(last) &&
    num(last.turnNo) &&
    (last.describingTable === 'owner' || last.describingTable === 'guest') &&
    num(last.score) &&
    num(last.correct) &&
    num(last.taboo) &&
    num(last.pass)
      ? {
          turnNo: last.turnNo,
          describingTable: last.describingTable,
          score: last.score,
          correct: last.correct,
          taboo: last.taboo,
          pass: last.pass,
        }
      : null;
  return { readyEndsAt: value.readyEndsAt, lastTurn };
}

// Who may start a ready turn: the describing table at once, either table once readyEndsAt passed.
export function mayBeginTurn(role: TableRole, readyEndsAt: string, now: number): boolean {
  return role === 'describer' || now >= Date.parse(readyEndsAt);
}

// The end of a running turn on the phone (docs/SPEC_V3.md §19.2): a short vibration in each of the
// last 5 seconds, a longer one at zero with "Süre bitti!".
export const TURN_CUE = { warnFromSeconds: 5, tickMs: 40, timeUpMs: 400 } as const;

export type TurnCue = { kind: 'tick' | 'timeUp'; vibrateMs: number };

export function turnCue(secondsLeft: number): TurnCue | null {
  if (secondsLeft === 0) return { kind: 'timeUp', vibrateMs: TURN_CUE.timeUpMs };
  if (secondsLeft > 0 && secondsLeft <= TURN_CUE.warnFromSeconds) {
    return { kind: 'tick', vibrateMs: TURN_CUE.tickMs };
  }
  return null;
}

export function voiceWinner(scores: Record<TableSide, number>): TableSide | 'draw' {
  if (scores.owner === scores.guest) return 'draw';
  return scores.owner > scores.guest ? 'owner' : 'guest';
}

export type GameState = VoiceTabuState | SohbetState;

export function isVoiceTabu(state: GameState | null): state is VoiceTabuState {
  return state?.concept === 'tabu';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';

export function parseGameState(value: unknown): GameState | null {
  if (!isRecord(value)) return null;
  // 'voice' is the refereed mode's name before docs/SPEC_V3.md §6.1.
  const mode = value.mode === 'voice' ? 'refereed' : value.mode;
  if (value.concept === 'tabu' && (mode === 'refereed' || mode === 'cooperative')) {
    const v = value;
    // A game started before §19.1 has no turnPhase: its turn runs.
    const ready = v.turnPhase === 'ready';
    const scores = v.scores;
    const teamScores: { team: number } | null =
      mode === 'cooperative' && isRecord(scores) && num(scores.team) ? { team: scores.team } : null;
    const tableScores: Record<TableSide, number> | null =
      mode === 'refereed' && isRecord(scores) && num(scores.owner) && num(scores.guest)
        ? { owner: scores.owner, guest: scores.guest }
        : null;
    if (
      (v.phase === 'playing' || v.phase === 'finished') &&
      num(v.gameNo) &&
      num(v.turnNo) &&
      num(v.totalTurns) &&
      num(v.turnSeconds) &&
      num(v.cardsPerTurn) &&
      (v.describingTable === 'owner' || v.describingTable === 'guest') &&
      (ready ? str(v.readyEndsAt) : str(v.turnEndsAt)) &&
      (teamScores !== null || tableScores !== null) &&
      num(v.passesUsed) &&
      num(v.maxPasses) &&
      num(v.cardIndex)
    ) {
      const base: TabuStateBase = {
        concept: 'tabu',
        phase: v.phase,
        gameNo: v.gameNo,
        turnNo: v.turnNo,
        totalTurns: v.totalTurns,
        turnSeconds: v.turnSeconds,
        cardsPerTurn: v.cardsPerTurn,
        describingTable: v.describingTable,
        turnPhase: ready ? 'ready' : 'running',
        turnEndsAt: !ready && str(v.turnEndsAt) ? v.turnEndsAt : null,
        readyEndsAt: ready && str(v.readyEndsAt) ? v.readyEndsAt : null,
        lastTurn: ready ? (parseReadyTurn(v)?.lastTurn ?? null) : null,
        passesUsed: v.passesUsed,
        maxPasses: v.maxPasses,
        cardIndex: v.cardIndex,
      };
      return teamScores
        ? { ...base, mode: 'cooperative', scores: teamScores }
        : { ...base, mode: 'refereed', scores: tableScores ?? { owner: 0, guest: 0 } };
    }
    return null;
  }
  if (value.concept === 'sohbet') {
    const v = value;
    if (
      str(v.cardId) &&
      str(v.prompt) &&
      str(v.nextAllowedAt) &&
      (SOHBET_THEMES as readonly unknown[]).includes(v.theme)
    ) {
      return {
        concept: 'sohbet',
        cardId: v.cardId,
        theme: v.theme as SohbetTheme,
        prompt: v.prompt,
        nextAllowedAt: v.nextAllowedAt,
      };
    }
  }
  return null;
}

// Between games the room is a chat and game_state keeps only the game counter and the last game's
// result (docs/SPEC_V3.md §5.1): the concept, and for two-table Tabu both scores (refereed) or the
// team's score (cooperative).
export type LastGame = {
  concept: 'tabu' | 'sohbet' | 'sahtekar' | 'harf' | 'sarki';
  scores: Record<TableSide, number> | null;
  teamScore: number | null;
  // A two-table Tabu game ended with "Oyunu bitir" before its last turn (docs/SPEC_V3.md §19.1):
  // the turn it stopped in, for game_abandoned.
  abandoned: { turnNo: number; totalTurns: number } | null;
  // A Sahtekar game: the counts for the rematch and the reveal (docs/SPEC_V3.md §20.2).
  sahtekar: SahtekarLastGame | null;
  // Harf Kapmaca and Şarkıda Geçsin (§20.3–20.4): objections used and rounds lost on the clock.
  say: { objections: number; timeouts: number } | null;
};
export type BetweenGames = { gameNo: number; lastGame: LastGame | null };

export function parseBetweenGames(value: unknown): BetweenGames {
  const state = isRecord(value) ? value : {};
  const gameNo = num(state.gameNo) ? state.gameNo : 0;
  const last = state.lastGame;
  if (
    !isRecord(last) ||
    !['tabu', 'sohbet', 'sahtekar', 'harf', 'sarki'].includes(String(last.concept))
  ) {
    return { gameNo, lastGame: null };
  }
  const scores = last.scores;
  return {
    gameNo,
    lastGame: {
      concept: last.concept as LastGame['concept'],
      scores:
        isRecord(scores) && num(scores.owner) && num(scores.guest)
          ? { owner: scores.owner, guest: scores.guest }
          : null,
      teamScore: isRecord(scores) && num(scores.team) ? scores.team : null,
      abandoned:
        last.abandoned === true && num(last.turnNo) && num(last.totalTurns)
          ? { turnNo: last.turnNo, totalTurns: last.totalTurns }
          : null,
      sahtekar: parseSahtekarLastGame(last),
      say:
        (last.concept === 'harf' || last.concept === 'sarki') &&
        isRecord(last.objectionsLeft) &&
        num(last.objectionsLeft.owner) &&
        num(last.objectionsLeft.guest) &&
        num(last.timeouts)
          ? {
              objections:
                2 * SAY_CONFIG[last.concept].objections -
                last.objectionsLeft.owner -
                last.objectionsLeft.guest,
              timeouts: last.timeouts,
            }
          : null,
    },
  };
}
