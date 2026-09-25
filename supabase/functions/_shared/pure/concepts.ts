// Game type per concept (docs/SPEC_V2.md §8.1). The concept decides the mode, so the database
// has no separate column: Tabu is played face to face (voice), Sohbet cards are read (text).
import type { Concept } from './rooms.ts';

export const GAME_MODES = ['voice', 'text'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const CONCEPT_MODES: Record<Concept, GameMode> = { tabu: 'voice', sohbet: 'text' };

export function conceptMode(concept: Concept): GameMode {
  return CONCEPT_MODES[concept];
}
