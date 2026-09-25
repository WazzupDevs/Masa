import { describe, expect, it } from 'vitest';

import { BADGES, earnedBadges } from './badges.ts';

const none = { games: 0, voiceTabuWins: 0, distinctTables: 0 };

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
    expect(earnedBadges({ ...none, distinctTables: 4 })).toEqual([]);
    expect(earnedBadges({ ...none, distinctTables: 5 })).toEqual(['five_tables']);
  });

  it('has no Sohbet theme badge (removed: themes are not stored per account)', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'first_game',
      'ten_games',
      'voice_tabu_five_wins',
      'five_tables',
    ]);
  });
});
