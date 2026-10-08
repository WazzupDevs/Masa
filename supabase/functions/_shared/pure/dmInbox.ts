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

// A conversation the caller has just read (dm/read answered): its row in the cached inbox counts
// nothing unread, so the badge drops at once, before the inbox is read again.
export function withThreadRead<T extends { threadId: string | null; unreadCount: number }>(
  threads: readonly T[],
  threadId: string,
): T[] {
  return threads.map((t) =>
    t.threadId === threadId && t.unreadCount > 0 ? { ...t, unreadCount: 0 } : t,
  );
}

// The caller's message as dm/send wrote it (adım 9.1), put into the cached page (newest first) so
// its bubble shows the 'sent' tick on the reply, without reading the page again. A page that
// already has it (read meanwhile) stays as it is.
// reply_to and reactions as dm_messages_page sends them (pure/messageExtras.ts reads them).
export type SentDm = { id: string; body: string; created_at: string; reply_to?: unknown };
export type DmPageRow = SentDm & {
  from_me: boolean;
  status: string | null;
  reply_to: unknown;
  reactions: unknown;
};

export function withSentDm(page: readonly DmPageRow[], sent: SentDm): DmPageRow[] {
  if (page.some((m) => m.id === sent.id)) return [...page];
  const row: DmPageRow = {
    ...sent,
    from_me: true,
    status: 'sent',
    reply_to: sent.reply_to ?? null,
    reactions: [],
  };
  const at = page.findIndex((m) => m.created_at <= sent.created_at);
  return at === -1 ? [...page, row] : [...page.slice(0, at), row, ...page.slice(at)];
}

// The DM's typing dots (§18.3): at most one `typing` every SEND_MS while the text changes; the
// dots hide SHOW_MS after the last one, or when a message arrives.
export const TYPING = { sendMs: 3000, showMs: 5000 } as const;

export function shouldSendTyping(lastSentAt: number | null, now: number): boolean {
  return lastSentAt === null || now - lastSentAt >= TYPING.sendMs;
}
