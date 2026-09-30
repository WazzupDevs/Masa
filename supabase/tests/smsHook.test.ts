// The Send SMS Hook target (docs/SPEC_V3.md §2). The hook itself is off in config.toml; these
// call the function directly with the local-only signing secret and the `local` provider (which
// sends nothing and exists only on the local stack).
import { createHmac, randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { LOCAL_HOOK_SECRET } from '../functions/_shared/pure/sms.ts';
import { anonKey, apiUrl, sql } from './local.ts';

afterAll(async () => {
  await sql.end();
});

const key = Buffer.from(LOCAL_HOOK_SECRET.replace('v1,whsec_', ''), 'base64');

function signed(payload: unknown, opts: { key?: Buffer; ageSeconds?: number } = {}) {
  const body = JSON.stringify(payload);
  const id = `msg_${randomUUID()}`;
  const ts = Math.floor(Date.now() / 1000) - (opts.ageSeconds ?? 0);
  const sig = createHmac('sha256', opts.key ?? key)
    .update(`${id}.${ts}.${body}`)
    .digest('base64');
  return {
    body,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(ts),
      'webhook-signature': `v1,${sig}`,
    },
  };
}

async function post(body: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${apiUrl}/functions/v1/sms`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json', ...headers },
    body,
  });
  return { status: res.status, body: (await res.json()) as unknown };
}

const payload = { user: { id: randomUUID(), phone: '905551112233' }, sms: { otp: '123456' } };

describe('sms hook', () => {
  it('refuses unsigned, wrongly signed and stale deliveries', async () => {
    const unsigned = await post(JSON.stringify(payload));
    expect(unsigned).toEqual({
      status: 401,
      body: { error: { http_code: 401, message: expect.any(String) } },
    });
    const wrong = signed(payload, { key: Buffer.from('another-secret') });
    expect((await post(wrong.body, wrong.headers)).status).toBe(401);
    const stale = signed(payload, { ageSeconds: 10 * 60 });
    expect((await post(stale.body, stale.headers)).status).toBe(401);
  });

  it('sends only to Turkish mobile numbers', async () => {
    const abroad = signed({ ...payload, user: { ...payload.user, phone: '15551112233' } });
    expect(await post(abroad.body, abroad.headers)).toEqual({
      status: 400,
      body: { error: { http_code: 400, message: expect.any(String) } },
    });
  });

  it('answers 200 for a signed delivery to a Turkish number', async () => {
    const ok = signed(payload);
    expect(await post(ok.body, ok.headers)).toEqual({ status: 200, body: {} });
  });
});
