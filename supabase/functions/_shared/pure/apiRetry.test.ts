import { describe, expect, it } from 'vitest';

import { callName, IDEMPOTENT_CALLS, RETRY_DELAY_MS, retriesAfter } from './apiRetry.ts';

describe('IDEMPOTENT_CALLS', () => {
  it('holds only calls that read or that the server applies at most once', () => {
    // Changing this list changes which failures the app sends twice: review each addition.
    expect([...IDEMPOTENT_CALLS].sort()).toEqual(
      ['friends/list', 'ping', 'profile/get', 'tabu/mark', 'tabu/turn-cards'].sort(),
    );
  });
});

describe('callName', () => {
  it('joins the function and its action; ping has none', () => {
    expect(callName('tabu', { action: 'mark', roomId: 'r' })).toBe('tabu/mark');
    expect(callName('ping', {})).toBe('ping');
    expect(callName('dm', { action: 1 })).toBe('dm');
  });
});

describe('retriesAfter', () => {
  it('sends an idempotent call once more after a 5xx', () => {
    for (const status of [500, 502, 503, 504, 546]) {
      expect(retriesAfter('tabu/mark', status, 1)).toBe(true);
    }
    expect(retriesAfter('ping', 500, 1)).toBe(true);
    expect(retriesAfter('friends/list', 503, 1)).toBe(true);
  });

  it('never twice, and never after an answer below 500', () => {
    expect(retriesAfter('tabu/mark', 500, 2)).toBe(false);
    for (const status of [200, 400, 401, 403, 404, 409, 426, 429]) {
      expect(retriesAfter('tabu/mark', status, 1)).toBe(false);
    }
  });

  it('never sends a call that may already have taken effect again', () => {
    for (const call of [
      'dm/send',
      'chat/send',
      'rooms/create',
      'rooms/request-join',
      'rooms/respond',
      'friends/request',
      'friends/respond',
      'friends/add-from-room',
      'safety/report',
      'safety/block',
      'tabu/start',
      'tabu/end-turn',
      'sohbet/next-card',
      'reveal/decide',
      'checkin/check-in',
      'account/delete',
      'profile/update',
      'profile/photo-commit',
    ]) {
      expect(retriesAfter(call, 500, 1), call).toBe(false);
    }
  });

  it('waits a short moment before the second attempt', () => {
    expect(RETRY_DELAY_MS).toBeGreaterThanOrEqual(200);
    expect(RETRY_DELAY_MS).toBeLessThanOrEqual(1000);
  });
});
