import { describe, expect, it } from 'vitest';

import { earnedBadges } from './badges.ts';

const none = { games: 0, voiceTabuWins: 0, distinctTables: 0, sohbetThemes: 0 };

describe('earnedBadges', () => {
  it('earns nothing without games', () => {
    expect(earnedBadges(none)).toEqual([]);
  });

  it('unlocks each badge at its threshold, not before', () => {
    expect(earnedBadges({ ...none, games: 1 })).toEqual(['first_game']);
    expect(earnedBadges({ ...none, games: 9 })).toEqual(['first_game']);
    expect(earnedBadges({ ...none, games: 10 })).toEqual(['first_game', 'ten_games']);
    expect(earnedBadges({ ...none, voiceTabuWins: 4 })).toEqual([]);
    expect(earnedBadges({ ...none, voiceTabuWins: 5 })).toEqual(['voice_tabu_five_wins']);
    expect(earnedBadges({ ...none, distinctTables: 5, sohbetThemes: 3 })).toEqual([
      'five_tables',
      'sohbet_three_themes',
    ]);
  });
});
