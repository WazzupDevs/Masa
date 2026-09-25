// Optimistic chat sending (MVP_SPEC §7): a message shows at once as "sending", disappears into
// the real list when the server accepts it, and stays as "failed" otherwise. Only failures that
// can succeed on a second try offer "Tekrar dene"; a rejected message (profanity, length, not in
// the room) shows why and can be removed.
import type { ErrorCode } from './errors.ts';

export type OutboxStatus = 'sending' | 'failed';

export type OutboxMessage = {
  localId: string;
  body: string;
  status: OutboxStatus;
  // null: no API error code (network failure, timeout).
  errorCode: ErrorCode | null;
};

export type Outbox = readonly OutboxMessage[];

export type OutboxAction =
  | { type: 'send'; localId: string; body: string }
  | { type: 'sent'; localId: string }
  | { type: 'failed'; localId: string; errorCode: ErrorCode | null }
  | { type: 'retry'; localId: string }
  | { type: 'remove'; localId: string };

// Errors worth retrying: no answer at all, the rate limit, or a server fault.
const RETRYABLE: readonly (ErrorCode | null)[] = [null, 'rate_limited', 'internal'];

export function canRetry(message: OutboxMessage): boolean {
  return message.status === 'failed' && RETRYABLE.includes(message.errorCode);
}

export function outboxReducer(outbox: Outbox, action: OutboxAction): Outbox {
  switch (action.type) {
    case 'send':
      return [
        ...outbox,
        { localId: action.localId, body: action.body, status: 'sending', errorCode: null },
      ];
    case 'sent':
    case 'remove':
      return outbox.filter((m) => m.localId !== action.localId);
    case 'failed':
      return outbox.map((m) =>
        m.localId === action.localId ? { ...m, status: 'failed', errorCode: action.errorCode } : m,
      );
    case 'retry':
      return outbox.map((m) =>
        m.localId === action.localId && canRetry(m)
          ? { ...m, status: 'sending', errorCode: null }
          : m,
      );
  }
}
