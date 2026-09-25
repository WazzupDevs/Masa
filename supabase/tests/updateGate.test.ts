// Forced update gate (x-app-build vs MIN_APP_BUILD). The normal suite runs with the gate open
// (MIN_APP_BUILD unset). The closed-gate cases need a function server started with a minimum:
//   echo MIN_APP_BUILD=5 > /tmp/gate.env && pnpm supabase functions serve --env-file /tmp/gate.env
//   GATE_MIN_APP_BUILD=5 pnpm vitest run -c vitest.integration.config.ts supabase/tests/updateGate.test.ts
import { afterAll, describe, expect, it } from 'vitest';

import { APP_BUILD_HEADER } from '../functions/_shared/pure/appVersion.ts';
import { anonKey, apiUrl, sql } from './local.ts';

const gateMin = Number(process.env.GATE_MIN_APP_BUILD ?? '0');

afterAll(async () => {
  await sql.end();
});

// A raw call, so the header is exactly what the test sets. account/complete-onboarding without a
// user token answers 401 once past the gate.
async function call(build: string | null, method = 'POST', fn = 'account') {
  const res = await fetch(`${apiUrl}/functions/v1/${fn}`, {
    method,
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
      ...(build === null ? {} : { [APP_BUILD_HEADER]: build }),
    },
    body: method === 'POST' ? JSON.stringify({ action: 'complete-onboarding' }) : undefined,
  });
  return { status: res.status, body: (await res.json()) as { error?: { code: string } } };
}

describe.runIf(gateMin === 0)('update gate, open (MIN_APP_BUILD unset)', () => {
  it('answers the launch and foreground ping without a user', async () => {
    expect(await call(null, 'POST', 'ping')).toEqual({ status: 200, body: { ok: true } });
    expect(await call('3', 'POST', 'ping')).toEqual({ status: 200, body: { ok: true } });
  });

  it('lets every build through, with or without the header', async () => {
    for (const build of [null, '1', 'abc']) {
      const res = await call(build);
      expect(res.body.error?.code, String(build)).not.toBe('update_required');
    }
  });
});

describe.runIf(gateMin > 0)('update gate, closed (MIN_APP_BUILD set)', () => {
  it('refuses a missing, malformed or older build before anything else', async () => {
    for (const build of [null, '', 'abc', String(gateMin - 1)]) {
      expect(await call(build), String(build)).toEqual({
        status: 426,
        body: { error: { code: 'update_required', message: expect.any(String) } },
      });
    }
    // Even a request the function would reject for another reason.
    expect((await call(null, 'GET')).body.error?.code).toBe('update_required');
  });

  it('catches an old build on the ping alone, before any other call', async () => {
    for (const build of [null, String(gateMin - 1)]) {
      expect((await call(build, 'POST', 'ping')).body.error?.code, String(build)).toBe(
        'update_required',
      );
    }
    expect(await call(String(gateMin), 'POST', 'ping')).toEqual({
      status: 200,
      body: { ok: true },
    });
  });

  it('lets the minimum build and newer ones through', async () => {
    for (const build of [String(gateMin), String(gateMin + 10)]) {
      const res = await call(build);
      expect(res.body.error?.code, build).not.toBe('update_required');
    }
  });
});
