import { describe, expect, it } from 'vitest';

import { prepareTerms } from './profanity.ts';
import {
  applyJudgement,
  checkClue,
  describingTableForTurn,
  isVoiceTabu,
  JUDGE_POINTS,
  judgingTable,
  parseGameState,
  TABU,
  voiceWinner,
  type VoiceTabuState,
} from './tabu.ts';

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

describe('voice Tabu (two tables, team = table)', () => {
  const now = Date.parse('2026-10-06T20:00:00Z');
  const state: VoiceTabuState = {
    concept: 'tabu',
    mode: 'voice',
    phase: 'playing',
    gameNo: 1,
    turnNo: 1,
    totalTurns: 6,
    turnSeconds: 60,
    describingTable: 'owner',
    turnEndsAt: '2026-10-06T20:00:30Z',
    scores: { owner: 0, guest: 0 },
    passesUsed: 0,
    maxPasses: 3,
  };

  it('scores Doğru +1, Tabu −1 and Pas 0 for the describing table', () => {
    expect(JUDGE_POINTS).toEqual({ correct: 1, taboo: -1, pass: 0 });
    const correct = applyJudgement(state, 'correct', now);
    expect(correct.ok && correct.state.scores).toEqual({ owner: 1, guest: 0 });
    const taboo = applyJudgement({ ...state, describingTable: 'guest' }, 'taboo', now);
    expect(taboo.ok && taboo.state.scores).toEqual({ owner: 0, guest: -1 });
    const pass = applyJudgement(state, 'pass', now);
    expect(pass.ok && [pass.state.scores, pass.state.passesUsed]).toEqual([
      { owner: 0, guest: 0 },
      1,
    ]);
  });

  it('limits passes per turn and refuses after the turn ended or the game finished', () => {
    expect(applyJudgement({ ...state, passesUsed: 3 }, 'pass', now)).toEqual({
      ok: false,
      reason: 'no_passes_left',
    });
    expect(applyJudgement({ ...state, passesUsed: 3 }, 'correct', now).ok).toBe(true);
    expect(applyJudgement(state, 'correct', Date.parse(state.turnEndsAt))).toEqual({
      ok: false,
      reason: 'turn_over',
    });
    expect(applyJudgement({ ...state, phase: 'finished' }, 'correct', now)).toEqual({
      ok: false,
      reason: 'no_game',
    });
  });

  it('alternates the describing table, and the other table judges', () => {
    expect([1, 2, 3, 4, 5, 6].map(describingTableForTurn)).toEqual([
      'owner',
      'guest',
      'owner',
      'guest',
      'owner',
      'guest',
    ]);
    expect(judgingTable(state)).toBe('guest');
    expect(judgingTable({ ...state, describingTable: 'guest' })).toBe('owner');
  });

  it('names the winner or a draw', () => {
    expect(voiceWinner({ owner: 3, guest: 2 })).toBe('owner');
    expect(voiceWinner({ owner: -1, guest: 0 })).toBe('guest');
    expect(voiceWinner({ owner: 2, guest: 2 })).toBe('draw');
  });

  it('parses the voice state and tells it apart from the written one', () => {
    const parsed = parseGameState(JSON.parse(JSON.stringify(state)));
    expect(parsed).toEqual(state);
    expect(isVoiceTabu(parsed)).toBe(true);
    expect(parseGameState({ ...state, scores: { owner: 1 } })).toBeNull();
    expect(parseGameState({ ...state, describingTable: 'x' })).toBeNull();
  });
});
