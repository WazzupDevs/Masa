import type { MarkResult, TabuCard } from '../tabu.ts';

// `tabu` and `sohbet` Edge Functions, shared with the mobile app.
export type TabuRequest =
  // One-table room: the deck for the phone. Two-table room: the face-to-face game.
  | { action: 'start'; roomId: string }
  // The ordered card list of the current turn, for the two tables of the room.
  | { action: 'turn-cards'; roomId: string }
  // A press on card `cardIndex` of turn `turnNo`; a second press on the same card is ignored.
  | { action: 'mark'; roomId: string; turnNo: number; cardIndex: number; result: MarkResult }
  | { action: 'end-turn'; roomId: string };

export type TabuStartResponse = { mode: 'local'; deck: TabuCard[] } | { mode: 'server' };
export type TabuTurnCardsResponse = { turnNo: number; cards: TabuCard[] };
export type GameOkResponse = { ok: true };

export type SohbetRequest = { action: 'next-card'; roomId: string };
