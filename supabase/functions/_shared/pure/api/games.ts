import type { MarkResult, TabuCard } from '../tabu.ts';

// `tabu` and `sohbet` Edge Functions, shared with the mobile app.
export type TabuRequest =
  // One-table room: the deck for the phone. A two-table game starts from rooms/answer-game.
  | { action: 'start'; roomId: string }
  // The ordered card list of the current turn, for the two tables of the room.
  | { action: 'turn-cards'; roomId: string }
  // A press on card `cardIndex` of turn `turnNo`; a second press on the same card is ignored.
  | { action: 'mark'; roomId: string; turnNo: number; cardIndex: number; result: MarkResult }
  | { action: 'end-turn'; roomId: string }
  // Starts the ready turn's clock: the describing table, or either table after readyEndsAt
  // (docs/SPEC_V3.md §19.1). Idempotent.
  | { action: 'begin-turn'; roomId: string };

export type TabuStartResponse = { mode: 'local'; deck: TabuCard[] };
export type TabuTurnCardsResponse = { turnNo: number; cards: TabuCard[] };
export type GameOkResponse = { ok: true };

export type SohbetRequest = { action: 'next-card'; roomId: string };

// `sahtekar` (docs/SPEC_V3.md §20.2). A two-table game starts from rooms/answer-game.
export type SahtekarRequest =
  // One-table room: a word, its category and 6 options; the phone runs the game.
  | { action: 'start'; roomId: string }
  // One of the caller's seats holds its card.
  | { action: 'view'; roomId: string; seat: string }
  // The speaking seat's table: "Söyledi" on clue step `step`.
  | { action: 'said'; roomId: string; step: number }
  | { action: 'vote'; roomId: string; voter: string; target: string }
  // The caught impostor's table: the 6 options, then its guess.
  | { action: 'options'; roomId: string }
  | { action: 'guess'; roomId: string; option: string }
  // Either table once the phase's time is up; idempotent.
  | { action: 'advance'; roomId: string };

export type SahtekarStartResponse = { category: string; word: string; options: string[] };
export type SahtekarViewResponse = {
  seat: string;
  category: string;
  word: string | null;
  imposter: boolean;
};
export type SahtekarOptionsResponse = { options: string[] };

// `harf` and `sarki` (docs/SPEC_V3.md §20.3–20.4): the same engine. A two-table game starts from
// rooms/answer-game; begin and advance are idempotent.
export type SayRequest =
  // One-table room: one prompt per round; the phone runs the game for Takım A and B.
  | { action: 'start'; roomId: string }
  | { action: 'begin'; roomId: string }
  // Söyledik on step `step` of round `round`; Harf Kapmaca names the letter.
  | { action: 'claim'; roomId: string; round: number; step: number; letter: string }
  | { action: 'said'; roomId: string; round: number; step: number }
  | { action: 'object'; roomId: string; round: number; step: number }
  | { action: 'advance'; roomId: string };
export type HarfRequest = Exclude<SayRequest, { action: 'said' }>;
export type SarkiRequest = Exclude<SayRequest, { action: 'claim' }>;
export type SayStartResponse = { prompts: string[] };
