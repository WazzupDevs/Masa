// Mesajlar (docs/SPEC_V3.md §18.3): the time label of a row and the tab's unread count.

// The label of a conversation's last message, by calendar day in the device's time zone: the
// time today, "Dün" yesterday, the weekday within the last week, otherwise the date.
export type InboxStamp =
  | { kind: 'time' }
  | { kind: 'yesterday' }
  | { kind: 'weekday'; weekday: number }
  | { kind: 'date' };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(t: Date): number {
  return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
}

export function inboxStamp(iso: string, now: Date): InboxStamp {
  const at = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return { kind: 'time' };
  if (days === 1) return { kind: 'yesterday' };
  if (days < 7) return { kind: 'weekday', weekday: at.getDay() };
  return { kind: 'date' };
}

// The Mesajlar tab's badge: every unread message across the conversations.
export function totalUnread(threads: readonly { unreadCount: number }[]): number {
  return threads.reduce((sum, t) => sum + Math.max(0, t.unreadCount), 0);
}

// The DM's typing dots (§18.3): at most one `typing` every SEND_MS while the text changes; the
// dots hide SHOW_MS after the last one, or when a message arrives.
export const TYPING = { sendMs: 3000, showMs: 5000 } as const;

export function shouldSendTyping(lastSentAt: number | null, now: number): boolean {
  return lastSentAt === null || now - lastSentAt >= TYPING.sendMs;
}
