// Run by hand with the Send SMS Hook enabled locally (config.toml → [auth.hook.send_sms],
// uncommented; stop + start): SMS_HOOK_ENABLED=1 pnpm vitest run -c vitest.integration.config.ts
// supabase/tests/smsHookEnabled.test.ts. Locally the hook is unreachable from Auth's container, so
// a real number fails at the hook; a test number still gets its code, which shows that test
// numbers (the dev project's and the Play review account) never reach the hook or a provider.
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import { anonKey, apiUrl, deleteUserByPhone, signIn, sql } from './local.ts';

afterAll(async () => {
  await deleteUserByPhone('+905550000003');
  await deleteUserByPhone('+905559990001');
  await sql.end();
});

describe.runIf(process.env.SMS_HOOK_ENABLED === '1')('sms hook enabled', () => {
  it('sends test numbers no SMS and real numbers through the hook', async () => {
    // signIn asks for the code and verifies the fixed test code; it throws on either error.
    await signIn('+905550000003');

    const client = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
    const real = await client.auth.signInWithOtp({ phone: '+905559990001' });
    expect(real.error?.message).toMatch(/hook/i);
  });
});
