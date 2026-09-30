import { describe, expect, it } from 'vitest';

import {
  isExpoPushToken,
  dmPush,
  friendRequestPush,
  joinAcceptedPush,
  joinRequestPush,
} from './push.ts';

describe('isExpoPushToken', () => {
  it('accepts Expo push tokens only', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('abc')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
  });
});

describe('push texts', () => {
  it('names only the table alias, headcount and concept', () => {
    expect(joinRequestPush('Mor Baykuş', 3).body).toBe(
      'Mor Baykuş (3 kişi) odana katılmak istiyor.',
    );
    expect(joinRequestPush('Mor Baykuş', 4).body).toContain('(4+ kişi)');
    expect(joinAcceptedPush().body.length).toBeGreaterThan(0);
  });

  it('say nothing about who wrote or asked, and nothing of the message', () => {
    expect(dmPush()).toEqual({ title: 'Kabuk', body: 'Yeni bir mesajın var' });
    expect(friendRequestPush()).toEqual({
      title: 'Kabuk',
      body: 'Yeni bir arkadaşlık isteğin var',
    });
  });
});
