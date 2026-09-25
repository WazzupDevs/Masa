import type { JudgeResult, TabuCard } from '../tabu.ts';

// `tabu` and `sohbet` Edge Functions, shared with the mobile app.
export type TabuRequest =
  // mode 'voice' (docs/SPEC_V2.md §8.2) from this release on; without it a two-table room still
  // gets the written game, for older APKs that cannot take the update (§8.3).
  | { action: 'start'; roomId: string; mode?: 'voice' }
  | { action: 'current-card'; roomId: string }
  // Voice: the table that is not describing, on the card it sees.
  | { action: 'judge'; roomId: string; cardId: string; result: JudgeResult }
  | { action: 'clue'; roomId: string; text: string }
  | { action: 'guess'; roomId: string; text: string }
  | { action: 'pass'; roomId: string }
  | { action: 'end-turn'; roomId: string };

// start: a one-table room gets its deck; a two-table room starts the server game.
export type TabuStartResponse = { mode: 'local'; deck: TabuCard[] } | { mode: 'server' };
export type TabuCardResponse = { cardId: string; word: string; forbidden: string[] };
export type TabuGuessResponse = { correct: boolean };
export type GameOkResponse = { ok: true };

export type SohbetRequest = { action: 'next-card'; roomId: string };
