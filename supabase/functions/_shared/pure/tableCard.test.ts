import { describe, expect, it } from 'vitest';

import { gameTag, lobbyActions, requestGone, tableState } from './tableCard.ts';

const room = (status: string, visibility = 'open') => ({ status, visibility });

describe('tableState', () => {
  it('is off without a room or with a closed one', () => {
    expect(tableState(null, true)).toBe('off');
    expect(tableState(room('closed'), true)).toBe('off');
    expect(tableState(room('closed'), false)).toBe('off');
  });

  it('is open for the leader of a waiting room and member for the other phones on its side', () => {
    expect(tableState(room('waiting'), true)).toBe('open');
    expect(tableState(room('waiting'), false)).toBe('member');
  });

  it('is merged for every phone of a two-sided room', () => {
    expect(tableState(room('active'), true)).toBe('merged');
    expect(tableState(room('active'), false)).toBe('merged');
  });

  it('is solo for "Masanla oyna"', () => {
    expect(tableState(room('active', 'private'), true)).toBe('solo');
    expect(tableState(room('waiting', 'private'), true)).toBe('solo');
  });
});

describe('lobbyActions', () => {
  it('offers "Katıl" without a room and from the own waiting room, "Bu masadayım" only without', () => {
    expect(lobbyActions('off')).toEqual({ join: true, member: true });
    expect(lobbyActions('open')).toEqual({ join: true, member: false });
  });

  it('offers nothing to a member, a merged table or a "Masanla oyna" table', () => {
    for (const state of ['member', 'merged', 'solo'] as const) {
      expect(lobbyActions(state)).toEqual({ join: false, member: false });
    }
  });
});

describe('gameTag', () => {
  it('keeps the six games and reads anything else as "fark etmez"', () => {
    expect(gameTag('tabu')).toBe('tabu');
    expect(gameTag('ibre')).toBe('ibre');
    expect(gameTag(null)).toBeNull();
    expect(gameTag('')).toBeNull();
    expect(gameTag('poker')).toBeNull();
  });
});

describe('requestGone', () => {
  it('is the requester table that merged meanwhile, or a request that ended', () => {
    expect(requestGone('room_not_available')).toBe(true);
    expect(requestGone('request_expired')).toBe(true);
    expect(requestGone('request_not_found')).toBe(true);
  });

  it('leaves every other error to the card as an error', () => {
    for (const code of ['internal', 'rate_limited', 'not_leader', 'already_in_room']) {
      expect(requestGone(code)).toBe(false);
    }
  });
});
