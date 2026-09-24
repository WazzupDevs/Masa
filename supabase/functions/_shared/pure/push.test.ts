import { describe, expect, it } from 'vitest';

import { isExpoPushToken, joinAcceptedPush, joinRequestPush } from './push.ts';

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
    expect(joinRequestPush('Mor Baykuş', 3, 'tabu').body).toBe(
      'Mor Baykuş (3 kişi) Tabu odana katılmak istiyor.',
    );
    expect(joinRequestPush('Mavi Kedi', 2, 'sohbet').body).toContain('Sohbet odana');
    expect(joinAcceptedPush().body.length).toBeGreaterThan(0);
  });
});
