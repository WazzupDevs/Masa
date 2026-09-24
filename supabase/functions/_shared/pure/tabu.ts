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

export type GameState = TabuState | SohbetState;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';

export function parseGameState(value: unknown): GameState | null {
  if (!isRecord(value)) return null;
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
