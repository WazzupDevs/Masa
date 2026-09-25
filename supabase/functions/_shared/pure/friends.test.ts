import { describe, expect, it } from 'vitest';

import {
  DM_MAX_LENGTH,
  ENCOUNTER_MIN_MINUTES,
  historyAction,
  isEncounterLongEnough,
  prepareDm,
  sentRequestView,
} from './friends.ts';

describe('isEncounterLongEnough', () => {
  it('needs 3 minutes of two tables', () => {
    expect(ENCOUNTER_MIN_MINUTES).toBe(3);
    const joined = '2026-10-05T20:00:00Z';
    expect(isEncounterLongEnough(joined, Date.parse('2026-10-05T20:02:59Z'))).toBe(false);
    expect(isEncounterLongEnough(joined, Date.parse('2026-10-05T20:03:00Z'))).toBe(true);
  });
});

describe('prepareDm', () => {
  it('trims and allows 1–500 characters', () => {
    expect(prepareDm('  selam ')).toBe('selam');
    expect(prepareDm('   ')).toBeNull();
    expect(prepareDm('ş'.repeat(DM_MAX_LENGTH))).toHaveLength(DM_MAX_LENGTH);
    expect(prepareDm('x'.repeat(DM_MAX_LENGTH + 1))).toBeNull();
  });
});

describe('sentRequestView', () => {
  it('shows a declined request as pending to its sender', () => {
    expect(sentRequestView('declined')).toBe('pending');
    expect(sentRequestView('pending')).toBe('pending');
    expect(sentRequestView('accepted')).toBe('accepted');
  });
});

describe('historyAction', () => {
  it('offers "Arkadaş ekle" only after a mutual Evet, and nothing once pressed', () => {
    expect(historyAction({ reveal_mutual: true, friend_action_at: null })).toBe('add_friend');
    expect(historyAction({ reveal_mutual: false, friend_action_at: null })).toBe('send_request');
    expect(historyAction({ reveal_mutual: false, friend_action_at: '2026-10-05T20:00:00Z' })).toBe(
      'done',
    );
  });
});
