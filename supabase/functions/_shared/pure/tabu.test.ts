import { describe, expect, it } from 'vitest';

import { prepareTerms } from './profanity.ts';
import { checkClue, parseGameState, TABU } from './tabu.ts';

const card = { word: 'Deniz', forbidden: ['dalga', 'kum', 'mavi', 'tuzlu', 'yüzmek'] };
const noProfanity = prepareTerms(['şerefsiz']);

describe('TABU rules', () => {
  it('match the spec', () => {
    expect(TABU).toMatchObject({ turnSeconds: 60, totalTurns: 6, maxPasses: 3 });
  });
});

describe('checkClue', () => {
  it('accepts a clean clue', () => {
    expect(checkClue('  yaz tatilinde gideriz  ', card, noProfanity)).toEqual({
      ok: true,
      clue: 'yaz tatilinde gideriz',
    });
  });

  it('rejects the target, forbidden words and their roots', () => {
    expect(checkClue('denizde yüzeriz', card, noProfanity)).toEqual({
      ok: false,
      reason: 'clue_forbidden',
    });
    expect(checkClue('Dalgalar büyük', card, noProfanity)).toEqual({
      ok: false,
      reason: 'clue_forbidden',
    });
    expect(checkClue('k u m', card, noProfanity)).toEqual({ ok: false, reason: 'clue_forbidden' });
  });

  it('rejects profanity and empty or long clues', () => {
    expect(checkClue('şerefsiz', card, noProfanity)).toEqual({
      ok: false,
      reason: 'profanity_rejected',
    });
    expect(checkClue('   ', card, noProfanity)).toEqual({ ok: false, reason: 'clue_invalid' });
    expect(checkClue('a'.repeat(101), card, noProfanity)).toEqual({
      ok: false,
      reason: 'clue_invalid',
    });
  });
});

describe('parseGameState', () => {
  it('reads a Tabu state without any card information', () => {
    const state = parseGameState({
      concept: 'tabu',
      phase: 'playing',
      gameNo: 1,
      turnNo: 2,
      totalTurns: 6,
      turnSeconds: 60,
      describerSessionId: 's1',
      turnEndsAt: '2026-09-29T10:00:00Z',
      passesUsed: 1,
      maxPasses: 3,
      score: 4,
    });
    expect(state).toMatchObject({ concept: 'tabu', phase: 'playing', turnNo: 2, score: 4 });
  });

  it('reads a Sohbet state and rejects anything else', () => {
    expect(
      parseGameState({
        concept: 'sohbet',
        cardId: 'c',
        theme: 'derin',
        prompt: 'Soru?',
        nextAllowedAt: 'x',
      }),
    ).toMatchObject({ concept: 'sohbet', prompt: 'Soru?' });
    expect(parseGameState({})).toBeNull();
    expect(parseGameState(null)).toBeNull();
    expect(parseGameState({ concept: 'tabu', phase: 'playing' })).toBeNull();
  });
});
