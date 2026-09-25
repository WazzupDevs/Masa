// Tabu rules (MVP_SPEC §5.1, docs/SPEC_V2.md §8.2). The SQL functions receive the numbers from
// here and apply the same rules as applyMark; the integration tests check that they agree.
import type { SohbetState, SohbetTheme } from './sohbet.ts';
import { SOHBET_THEMES } from './sohbet.ts';

export const TABU = {
  turnSeconds: 60,
  totalTurns: 6,
  maxPasses: 3,
  // Cards dealt to a turn at once (both tables get the list at the start of the turn). A fast
  // table closes a card every ~2 seconds, so 40 cover a 60 second turn.
  cardsPerTurn: 40,
  // One-table game (§5.1): teams A and B, 3 rounds each.
  localRoundsPerTeam: 3,
  localDeckSize: 120,
} as const;

export type TabuCard = { word: string; forbidden: readonly string[] };

// Two-table Tabu, face to face (docs/SPEC_V2.md §8.2): team = table, one score per table. The
// card list goes to both tables through tabu/turn-cards; rooms.game_state never holds a card.
export type TableSide = 'owner' | 'guest';

export type VoiceTabuState = {
  concept: 'tabu';
  mode: 'voice';
  phase: 'playing' | 'finished';
  gameNo: number;
  turnNo: number;
  totalTurns: number;
  turnSeconds: number;
  cardsPerTurn: number;
  describingTable: TableSide;
  turnEndsAt: string;
  scores: Record<TableSide, number>;
  passesUsed: number;
  maxPasses: number;
  // Index of the card being played in this turn's list.
  cardIndex: number;
};

export const MARK_RESULTS = ['correct', 'taboo', 'pass'] as const;
export type MarkResult = (typeof MARK_RESULTS)[number];
// Points for the describing table: Doğru +1, Tabu −1, Pas 0.
export const MARK_POINTS: Record<MarkResult, number> = { correct: 1, taboo: -1, pass: 0 };

// A table's role in the current turn.
export type TableRole = 'describer' | 'judge';

// Tabu only the judging table, Pas only the describing table, Doğru either.
export function mayMark(role: TableRole, result: MarkResult): boolean {
  if (result === 'taboo') return role === 'judge';
  if (result === 'pass') return role === 'describer';
  return true;
}

export type Mark = { turnNo: number; cardIndex: number; result: MarkResult };

export type MarkOutcome =
  | { kind: 'applied'; state: VoiceTabuState }
  // Another turn, a card already closed, a card ahead of this state, or past the list: the same
  // card is never counted twice and the server's order wins.
  | { kind: 'ignored' }
  | {
      kind: 'rejected';
      reason: 'no_game' | 'not_judge' | 'not_describer' | 'turn_over' | 'no_passes_left';
    };

export function applyMark(
  state: VoiceTabuState,
  mark: Mark,
  role: TableRole,
  now: number,
): MarkOutcome {
  if (state.phase !== 'playing') return { kind: 'rejected', reason: 'no_game' };
  if (!mayMark(role, mark.result)) {
    return { kind: 'rejected', reason: mark.result === 'taboo' ? 'not_judge' : 'not_describer' };
  }
  if (
    mark.turnNo !== state.turnNo ||
    mark.cardIndex !== state.cardIndex ||
    mark.cardIndex >= state.cardsPerTurn
  ) {
    return { kind: 'ignored' };
  }
  if (now >= Date.parse(state.turnEndsAt)) return { kind: 'rejected', reason: 'turn_over' };
  if (mark.result === 'pass' && state.passesUsed >= state.maxPasses) {
    return { kind: 'rejected', reason: 'no_passes_left' };
  }
  const side = state.describingTable;
  return {
    kind: 'applied',
    state: {
      ...state,
      scores: { ...state.scores, [side]: state.scores[side] + MARK_POINTS[mark.result] },
      passesUsed: state.passesUsed + (mark.result === 'pass' ? 1 : 0),
      cardIndex: state.cardIndex + 1,
    },
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
  return state.describingTable === side ? 'describer' : 'judge';
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
  if (value.concept === 'tabu' && value.mode === 'voice') {
    const v = value;
    const scores = v.scores;
    if (
      (v.phase === 'playing' || v.phase === 'finished') &&
      num(v.gameNo) &&
      num(v.turnNo) &&
      num(v.totalTurns) &&
      num(v.turnSeconds) &&
      num(v.cardsPerTurn) &&
      (v.describingTable === 'owner' || v.describingTable === 'guest') &&
      str(v.turnEndsAt) &&
      isRecord(scores) &&
      num(scores.owner) &&
      num(scores.guest) &&
      num(v.passesUsed) &&
      num(v.maxPasses) &&
      num(v.cardIndex)
    ) {
      return {
        concept: 'tabu',
        mode: 'voice',
        phase: v.phase,
        gameNo: v.gameNo,
        turnNo: v.turnNo,
        totalTurns: v.totalTurns,
        turnSeconds: v.turnSeconds,
        cardsPerTurn: v.cardsPerTurn,
        describingTable: v.describingTable,
        turnEndsAt: v.turnEndsAt,
        scores: { owner: scores.owner, guest: scores.guest },
        passesUsed: v.passesUsed,
        maxPasses: v.maxPasses,
        cardIndex: v.cardIndex,
      };
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
