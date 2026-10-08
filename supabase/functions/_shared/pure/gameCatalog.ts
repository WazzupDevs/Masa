// The games and who can play them (docs/SPEC_V3.md §20.1): for each game, how it is played on one
// phone (a one-table room: the table splits into teams or passes the phone) and between two tables
// (a two-table room), and the fewest people each way needs. The single source: the game modules'
// own limits read from here, and the room's and Aktiviteler's game cards dim themselves from
// gameAvailability().

import type { Concept } from './rooms.ts';

export type PlayMode = 'onePhone' | 'twoTables';

export type GameEntry = {
  // The fewest people at the table for the one-phone game.
  onePhone: { minPlayers: number };
  // The fewest people across both tables. Two tables always have at least one person each, so 2
  // is no limit at all.
  twoTables: { minTotal: number };
};

export const GAME_CATALOG: Record<Concept, GameEntry> = {
  tabu: { onePhone: { minPlayers: 2 }, twoTables: { minTotal: 2 } },
  sohbet: { onePhone: { minPlayers: 1 }, twoTables: { minTotal: 2 } },
  sahtekar: { onePhone: { minPlayers: 3 }, twoTables: { minTotal: 3 } },
  harf: { onePhone: { minPlayers: 2 }, twoTables: { minTotal: 2 } },
  sarki: { onePhone: { minPlayers: 2 }, twoTables: { minTotal: 2 } },
  ibre: { onePhone: { minPlayers: 2 }, twoTables: { minTotal: 2 } },
};

export type Availability =
  | { available: true }
  // Dimmed: the card says the game needs at least `minPlayers` people (at the table on one phone,
  // across both tables between two).
  | { available: false; reason: 'needs_players'; minPlayers: number };

// Whether `concept` can be played now. `players`: the table's headcount on one phone, both tables'
// headcounts added up between two tables.
export function gameAvailability(concept: Concept, mode: PlayMode, players: number): Availability {
  const entry = GAME_CATALOG[concept];
  const min = mode === 'onePhone' ? entry.onePhone.minPlayers : entry.twoTables.minTotal;
  return players >= min
    ? { available: true }
    : { available: false, reason: 'needs_players', minPlayers: min };
}
