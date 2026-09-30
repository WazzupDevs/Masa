import { createHmac, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  base64Decode,
  base64Encode,
  type HmacSha256,
  parseHookSecrets,
  verifyWebhook,
} from './webhookSignature.ts';

const hmac: HmacSha256 = (key, message) =>
  Promise.resolve(new Uint8Array(createHmac('sha256', key).update(message, 'utf8').digest()));

const key = new Uint8Array(randomBytes(32));
const secret = `v1,whsec_${Buffer.from(key).toString('base64')}`;
const body = JSON.stringify({ user: { phone: '+905550000001' }, sms: { otp: '123456' } });
const now = 1_790_000_000;

function sign(id: string, ts: number, content: string, k = key): string {
  return `v1,${createHmac('sha256', k).update(`${id}.${ts}.${content}`).digest('base64')}`;
}

describe('webhook signature', () => {
  it('base64 round-trips like Node', () => {
    for (const len of [0, 1, 2, 3, 31, 32, 33]) {
      const bytes = new Uint8Array(randomBytes(len));
      expect(base64Encode(bytes)).toBe(Buffer.from(bytes).toString('base64'));
      expect(base64Decode(base64Encode(bytes))).toEqual(bytes);
    }
    expect(base64Decode('not base64!')).toBeNull();
  });

  it('reads Supabase secrets, one or several', () => {
    expect(parseHookSecrets(secret)).toEqual([key]);
    expect(parseHookSecrets(`${secret}|${secret}`)).toHaveLength(2);
    expect(parseHookSecrets('whsec_abc')).toEqual([]);
    expect(parseHookSecrets('')).toEqual([]);
  });

  it('accepts a valid signature', async () => {
    const headers = { id: 'msg_1', timestamp: String(now), signature: sign('msg_1', now, body) };
    expect(await verifyWebhook(headers, body, parseHookSecrets(secret), now, hmac)).toBe(true);
  });

  it('accepts when any of several signatures matches', async () => {
    const other = new Uint8Array(randomBytes(32));
    const headers = {
      id: 'msg_1',
      timestamp: String(now),
      signature: `${sign('msg_1', now, body, other)} ${sign('msg_1', now, body)}`,
    };
    expect(await verifyWebhook(headers, body, [key], now, hmac)).toBe(true);
  });

  it('rejects a changed body, a wrong key and missing headers', async () => {
    const headers = { id: 'msg_1', timestamp: String(now), signature: sign('msg_1', now, body) };
    expect(await verifyWebhook(headers, body.replace('123456', '654321'), [key], now, hmac)).toBe(
      false,
    );
    expect(await verifyWebhook(headers, body, [new Uint8Array(randomBytes(32))], now, hmac)).toBe(
      false,
    );
    expect(await verifyWebhook({ ...headers, signature: null }, body, [key], now, hmac)).toBe(
      false,
    );
    expect(await verifyWebhook(headers, body, [], now, hmac)).toBe(false);
  });

  it('rejects an old or future timestamp', async () => {
    const old = now - 6 * 60;
    const headers = { id: 'msg_1', timestamp: String(old), signature: sign('msg_1', old, body) };
    expect(await verifyWebhook(headers, body, [key], now, hmac)).toBe(false);
    const ahead = now + 6 * 60;
    const future = { id: 'msg_1', timestamp: String(ahead), signature: sign('msg_1', ahead, body) };
    expect(await verifyWebhook(future, body, [key], now, hmac)).toBe(false);
  });
});
