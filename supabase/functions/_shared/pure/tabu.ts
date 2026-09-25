// Tabu rules (MVP_SPEC §5.1, §5.2). The SQL functions receive the numbers from here.
import { type PreparedTerms, containsProfanity } from './profanity.ts';
import type { SohbetState, SohbetTheme } from './sohbet.ts';
import { SOHBET_THEMES } from './sohbet.ts';
import { containsForbidden } from './trText.ts';

export const TABU = {
  turnSeconds: 60,
  totalTurns: 6,
  maxPasses: 3,
  // One-table game (§5.1): teams A and B, 3 rounds each.
  localRoundsPerTeam: 3,
  localDeckSize: 120,
} as const;

export const MAX_CLUE_LENGTH = 100;

export type TabuCard = { word: string; forbidden: readonly string[] };

export type ClueCheck =
  | { ok: true; clue: string }
  | { ok: false; reason: 'clue_forbidden' | 'profanity_rejected' | 'clue_invalid' };

// The describer's clue: no target, no forbidden word, no root of them (§6), no profanity. The app
// runs this for the instant warning; the server decides.
export function checkClue(raw: string, card: TabuCard, profanity: PreparedTerms): ClueCheck {
  const clue = raw.trim();
  const length = [...clue].length;
  if (length === 0 || length > MAX_CLUE_LENGTH) return { ok: false, reason: 'clue_invalid' };
  if (containsForbidden(clue, [card.word, ...card.forbidden])) {
    return { ok: false, reason: 'clue_forbidden' };
  }
  if (containsProfanity(clue, profanity)) return { ok: false, reason: 'profanity_rejected' };
  return { ok: true, clue };
}

// Public two-table state in rooms.game_state. It never holds the card.
export type TabuState = {
  concept: 'tabu';
  phase: 'playing' | 'finished';
  gameNo: number;
  turnNo: number;
  totalTurns: number;
  turnSeconds: number;
  describerSessionId: string;
  turnEndsAt: string;
  passesUsed: number;
  maxPasses: number;
  score: number;
};

// Two-table voice Tabu (docs/SPEC_V2.md §8.2): team = table, one score per table. The card
// goes to both tables (the other table judges); rooms.game_state still never holds it.
export type TableSide = 'owner' | 'guest';

export type VoiceTabuState = {
  concept: 'tabu';
  mode: 'voice';
  phase: 'playing' | 'finished';
  gameNo: number;
  turnNo: number;
  totalTurns: number;
  turnSeconds: number;
  describingTable: TableSide;
  turnEndsAt: string;
  scores: Record<TableSide, number>;
  passesUsed: number;
  maxPasses: number;
};

export const JUDGE_RESULTS = ['correct', 'taboo', 'pass'] as const;
export type JudgeResult = (typeof JUDGE_RESULTS)[number];
// Doğru +1, Tabu −1, Pas 0 (the same as the one-table game). tabu_judge applies the same points.
export const JUDGE_POINTS: Record<JudgeResult, number> = { correct: 1, taboo: -1, pass: 0 };

export type Judgement =
  | { ok: true; state: VoiceTabuState }
  | { ok: false; reason: 'no_game' | 'turn_over' | 'no_passes_left' };

// The judge's press applied to the public state, as the server does it.
export function applyJudgement(state: VoiceTabuState, result: JudgeResult, now: number): Judgement {
  if (state.phase !== 'playing') return { ok: false, reason: 'no_game' };
  if (now >= Date.parse(state.turnEndsAt)) return { ok: false, reason: 'turn_over' };
  if (result === 'pass' && state.passesUsed >= state.maxPasses) {
    return { ok: false, reason: 'no_passes_left' };
  }
  const side = state.describingTable;
  return {
    ok: true,
    state: {
      ...state,
      scores: { ...state.scores, [side]: state.scores[side] + JUDGE_POINTS[result] },
      passesUsed: state.passesUsed + (result === 'pass' ? 1 : 0),
    },
  };
}

// Tables take turns: odd turns the owner's table describes, even turns the guest's.
export function describingTableForTurn(turnNo: number): TableSide {
  return turnNo % 2 === 1 ? 'owner' : 'guest';
}

export function judgingTable(state: VoiceTabuState): TableSide {
  return state.describingTable === 'owner' ? 'guest' : 'owner';
}

export function voiceWinner(scores: Record<TableSide, number>): TableSide | 'draw' {
  if (scores.owner === scores.guest) return 'draw';
  return scores.owner > scores.guest ? 'owner' : 'guest';
}

export type GameState = TabuState | VoiceTabuState | SohbetState;

export function isVoiceTabu(state: GameState | null): state is VoiceTabuState {
  return state?.concept === 'tabu' && 'mode' in state && state.mode === 'voice';
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
      (v.describingTable === 'owner' || v.describingTable === 'guest') &&
      str(v.turnEndsAt) &&
      isRecord(scores) &&
      num(scores.owner) &&
      num(scores.guest) &&
      num(v.passesUsed) &&
      num(v.maxPasses)
    ) {
      return {
        concept: 'tabu',
        mode: 'voice',
        phase: v.phase,
        gameNo: v.gameNo,
        turnNo: v.turnNo,
        totalTurns: v.totalTurns,
        turnSeconds: v.turnSeconds,
        describingTable: v.describingTable,
        turnEndsAt: v.turnEndsAt,
        scores: { owner: scores.owner, guest: scores.guest },
        passesUsed: v.passesUsed,
        maxPasses: v.maxPasses,
      };
    }
    return null;
  }
  if (value.concept === 'tabu') {
    const v = value;
    if (
      (v.phase === 'playing' || v.phase === 'finished') &&
      num(v.gameNo) &&
      num(v.turnNo) &&
      num(v.totalTurns) &&
      num(v.turnSeconds) &&
      str(v.describerSessionId) &&
      str(v.turnEndsAt) &&
      num(v.passesUsed) &&
      num(v.maxPasses) &&
      num(v.score)
    ) {
      return {
        concept: 'tabu',
        phase: v.phase,
        gameNo: v.gameNo,
        turnNo: v.turnNo,
        totalTurns: v.totalTurns,
        turnSeconds: v.turnSeconds,
        describerSessionId: v.describerSessionId,
        turnEndsAt: v.turnEndsAt,
        passesUsed: v.passesUsed,
        maxPasses: v.maxPasses,
        score: v.score,
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
