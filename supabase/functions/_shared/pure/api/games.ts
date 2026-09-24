import type { TabuCard } from '../tabu.ts';

// `tabu` and `sohbet` Edge Functions, shared with the mobile app.
export type TabuRequest =
  | { action: 'start'; roomId: string }
  | { action: 'current-card'; roomId: string }
  | { action: 'clue'; roomId: string; text: string }
  | { action: 'guess'; roomId: string; text: string }
  | { action: 'pass'; roomId: string }
  | { action: 'end-turn'; roomId: string };

// start: a one-table room gets its deck; a two-table room starts the server game.
export type TabuStartResponse = { mode: 'local'; deck: TabuCard[] } | { mode: 'server' };
export type TabuCardResponse = { word: string; forbidden: string[] };
export type TabuGuessResponse = { correct: boolean };
export type GameOkResponse = { ok: true };

export type SohbetRequest = { action: 'next-card'; roomId: string };
