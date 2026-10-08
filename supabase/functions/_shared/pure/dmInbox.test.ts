import { describe, expect, it } from 'vitest';

import { inboxStamp, shouldSendTyping, totalUnread, TYPING, withThreadRead } from './dmInbox.ts';

// Local times, so the calendar day does not depend on the machine's time zone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const now = new Date(2026, 9, 2, 10); // Friday 2 October 2026, 10:00

describe('inboxStamp', () => {
  it('shows the time today, "Dün" yesterday, the weekday this week, the date before', () => {
    expect(inboxStamp(at(2026, 10, 2, 0), now)).toEqual({ kind: 'time' });
    expect(inboxStamp(at(2026, 10, 1, 23), now)).toEqual({ kind: 'yesterday' });
    expect(inboxStamp(at(2026, 9, 28), now)).toEqual({ kind: 'weekday', weekday: 1 });
    expect(inboxStamp(at(2026, 9, 26), now)).toEqual({ kind: 'weekday', weekday: 6 });
    expect(inboxStamp(at(2026, 9, 25), now)).toEqual({ kind: 'date' });
  });

  it('treats a clock slightly ahead of the device as today', () => {
    expect(inboxStamp(new Date(now.getTime() + 60_000).toISOString(), now)).toEqual({
      kind: 'time',
    });
  });
});

describe('totalUnread', () => {
  it('adds the unread counts of every conversation', () => {
    expect(totalUnread([])).toBe(0);
    expect(totalUnread([{ unreadCount: 2 }, { unreadCount: 0 }, { unreadCount: 5 }])).toBe(7);
  });
});

describe('withThreadRead', () => {
  it('clears the read conversation only, so the badge drops at once', () => {
    const threads = [
      { threadId: 't1', unreadCount: 3 },
      { threadId: 't2', unreadCount: 1 },
      { threadId: null, unreadCount: 0 },
    ];
    const after = withThreadRead(threads, 't1');
    expect(after).toEqual([
      { threadId: 't1', unreadCount: 0 },
      { threadId: 't2', unreadCount: 1 },
      { threadId: null, unreadCount: 0 },
    ]);
    expect(totalUnread(after)).toBe(1);
    // Nothing unread there: the same rows back.
    expect(withThreadRead(after, 't1')[1]).toBe(after[1]);
  });
});

describe('shouldSendTyping', () => {
  it('sends at most once every 3 seconds', () => {
    expect(TYPING).toEqual({ sendMs: 3000, showMs: 5000 });
    expect(shouldSendTyping(null, 1000)).toBe(true);
    expect(shouldSendTyping(1000, 3999)).toBe(false);
    expect(shouldSendTyping(1000, 4000)).toBe(true);
  });
});
