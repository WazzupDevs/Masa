// Badges and titles (docs/SPEC_V2.md §5.1): derived from what the server knows, never stored.
// Texts live in the app's tr.ts under the same ids.

export type UserStats = {
  // Games recorded in game_results (two-table games only).
  games: number;
  voiceTabuWins: number;
  // Different tables met (play_history, from step 4).
  distinctTables: number;
  // Sohbet themes seen in two-table rooms (from step 4).
  sohbetThemes: number;
};

export const BADGES = [
  { id: 'first_game', earned: (s: UserStats) => s.games >= 1 },
  { id: 'ten_games', earned: (s: UserStats) => s.games >= 10 },
  { id: 'voice_tabu_five_wins', earned: (s: UserStats) => s.voiceTabuWins >= 5 },
  { id: 'five_tables', earned: (s: UserStats) => s.distinctTables >= 5 },
  { id: 'sohbet_three_themes', earned: (s: UserStats) => s.sohbetThemes >= 3 },
] as const;

export type BadgeId = (typeof BADGES)[number]['id'];

export function earnedBadges(stats: UserStats): BadgeId[] {
  return BADGES.filter((b) => b.earned(stats)).map((b) => b.id);
}
