import { describe, expect, it } from 'vitest';

import { GAME_CATALOG, gameAvailability } from './gameCatalog.ts';
import { IBRE_CONFIG } from './ibre.ts';
import { CONCEPTS } from './rooms.ts';
import { SAHTEKAR } from './sahtekar.ts';
import { SAY_CONFIG } from './sayChallenge.ts';

describe('the game catalog', () => {
  it('lists every game', () => {
    expect(Object.keys(GAME_CATALOG).sort()).toEqual([...CONCEPTS].sort());
  });

  it('holds the one-phone minimums: Sahtekar 3; Harf, Şarkı, İbre and Tabu 2; Sohbet 1', () => {
    const one = Object.fromEntries(CONCEPTS.map((c) => [c, GAME_CATALOG[c].onePhone.minPlayers]));
    expect(one).toEqual({ sahtekar: 3, harf: 2, sarki: 2, ibre: 2, tabu: 2, sohbet: 1 });
  });

  it('asks three across both tables for Sahtekar only', () => {
    expect(GAME_CATALOG.sahtekar.twoTables.minTotal).toBe(3);
    for (const c of CONCEPTS.filter((c) => c !== 'sahtekar')) {
      expect(GAME_CATALOG[c].twoTables.minTotal, c).toBe(2);
    }
  });

  it('is what the games themselves enforce', () => {
    expect(SAHTEKAR.minPlayers).toBe(GAME_CATALOG.sahtekar.onePhone.minPlayers);
    expect(SAHTEKAR.minPlayers).toBe(GAME_CATALOG.sahtekar.twoTables.minTotal);
    expect(SAY_CONFIG.harf.minLocalPlayers).toBe(GAME_CATALOG.harf.onePhone.minPlayers);
    expect(SAY_CONFIG.sarki.minLocalPlayers).toBe(GAME_CATALOG.sarki.onePhone.minPlayers);
    expect(IBRE_CONFIG.minLocalPlayers).toBe(GAME_CATALOG.ibre.onePhone.minPlayers);
  });
});

describe('gameAvailability', () => {
  it('dims a game below its minimum and says how many it needs', () => {
    expect(gameAvailability('sahtekar', 'onePhone', 2)).toEqual({
      available: false,
      reason: 'needs_players',
      minPlayers: 3,
    });
    expect(gameAvailability('sahtekar', 'onePhone', 3)).toEqual({ available: true });
    expect(gameAvailability('tabu', 'onePhone', 1)).toEqual({
      available: false,
      reason: 'needs_players',
      minPlayers: 2,
    });
    expect(gameAvailability('sohbet', 'onePhone', 1)).toEqual({ available: true });
  });

  it('counts both tables between two tables', () => {
    expect(gameAvailability('sahtekar', 'twoTables', 2)).toEqual({
      available: false,
      reason: 'needs_players',
      minPlayers: 3,
    });
    expect(gameAvailability('sahtekar', 'twoTables', 3)).toEqual({ available: true });
    expect(gameAvailability('ibre', 'twoTables', 2)).toEqual({ available: true });
  });
});
