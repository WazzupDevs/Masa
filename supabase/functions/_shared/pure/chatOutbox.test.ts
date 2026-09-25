import { describe, expect, it } from 'vitest';

import { canRetry, type Outbox, type OutboxMessage, outboxReducer } from './chatOutbox.ts';
import type { ErrorCode } from './errors.ts';

const sending: Outbox = outboxReducer([], { type: 'send', localId: 'a', body: 'selam' });

describe('outboxReducer', () => {
  it('shows a message as sending at once, in order', () => {
    const two = outboxReducer(sending, { type: 'send', localId: 'b', body: 'naber' });
    expect(two.map((m) => [m.localId, m.status])).toEqual([
      ['a', 'sending'],
      ['b', 'sending'],
    ]);
  });

  it('drops the message once the server accepted it', () => {
    expect(outboxReducer(sending, { type: 'sent', localId: 'a' })).toEqual([]);
  });

  it('keeps a failed message with its error, and retries it', () => {
    const failed = outboxReducer(sending, { type: 'failed', localId: 'a', errorCode: null });
    expect(failed[0]).toMatchObject({ status: 'failed', errorCode: null });
    expect(outboxReducer(failed, { type: 'retry', localId: 'a' })[0]).toMatchObject({
      status: 'sending',
      body: 'selam',
    });
  });

  it('removes a message on request', () => {
    expect(outboxReducer(sending, { type: 'remove', localId: 'a' })).toEqual([]);
  });
});

describe('canRetry', () => {
  const failedWith = (errorCode: ErrorCode | null): OutboxMessage => {
    const [message] = outboxReducer(sending, { type: 'failed', localId: 'a', errorCode });
    if (!message) throw new Error('no message');
    return message;
  };

  it('offers a retry for network failures, the rate limit and server faults', () => {
    for (const code of [null, 'rate_limited', 'internal'] as const) {
      const message = failedWith(code);
      expect(canRetry(message), String(code)).toBe(true);
    }
  });

  it('does not offer a retry for rejected messages', () => {
    for (const code of ['profanity_rejected', 'message_invalid', 'not_in_room'] as const) {
      const message = failedWith(code);
      expect(canRetry(message), code).toBe(false);
      const retried = outboxReducer([message], { type: 'retry', localId: 'a' });
      expect(retried[0]?.status).toBe('failed');
    }
  });

  it('never retries a message that is still sending', () => {
    const [message] = sending;
    expect(message && canRetry(message)).toBe(false);
  });
});
