// Connection details of the local Supabase stack, read from `supabase status`.
import { execSync } from 'node:child_process';

import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';

import type { Database } from '../functions/_shared/pure/database.ts';

function readStatus(): Record<string, string> {
  const out = execSync('pnpm -s supabase status -o env', { encoding: 'utf8' });
  return Object.fromEntries(
    out
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
}

const status = readStatus();

function value(name: string): string {
  const v = status[name];
  if (!v) throw new Error(`supabase status has no ${name}; is the local stack running?`);
  return v;
}

export const apiUrl = value('API_URL');
export const anonKey = value('ANON_KEY');
const secretKey = value('SECRET_KEY');
export const dbUrl = value('DB_URL');
export const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });

export const TEST_OTP = '123456';

// Same kind of client `pnpm admin:ban` uses on a developer machine.
export const admin = createClient<Database>(apiUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Signs a local test number in (see [auth.sms.test_otp] in config.toml).
export async function signIn(phone: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Skip the 60 s resend limit (auth.sms.max_frequency) when a test signs the same number in again.
  await sql`
    update auth.users set confirmation_sent_at = null, recovery_sent_at = null
    where phone = ${phone.replace(/\D/g, '')}
  `;
  const sent = await client.auth.signInWithOtp({ phone });
  if (sent.error) throw sent.error;
  const verified = await client.auth.verifyOtp({ phone, token: TEST_OTP, type: 'sms' });
  if (verified.error) throw verified.error;
  return client;
}

export async function deleteUserByPhone(phone: string): Promise<void> {
  await sql`delete from auth.users where phone = ${phone.replace(/\D/g, '')}`;
}

export type Client = SupabaseClient<Database>;

// The local serve (`per_worker`) retires an isolate once the CPU time of the requests it served adds
// up past its 1 s soft limit. A request routed to it at that moment is refused before the function
// runs (WorkerAlreadyRetired) with this body from the serve's main service, not from our code
// (ours is `{ error: { code, message } }`). Nothing ran, so sending it again is its first attempt.
const RETIRED_WORKER_BODY =
  '{"code":"Internal Server Error","message":"Request failed due to an internal server error"}';

// Calls an Edge Function; errors come back as { status, body } instead of throwing. A 5xx is never
// an expected answer, so it throws with the function, action and body to name the failure.
export async function invoke(
  client: Client,
  fn: string,
  body: Record<string, unknown>,
  attempt = 1,
): Promise<{ status: number; body: unknown }> {
  const { data, error } = await client.functions.invoke(fn, { body });
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status as number;
    const text = await (error.context as Response).text();
    if (status === 500 && text === RETIRED_WORKER_BODY && attempt === 1) {
      console.warn(`retired worker: sending ${fn}/${String(body.action)} again`);
      return invoke(client, fn, body, 2);
    }
    if (status >= 500) {
      throw new Error(`${fn}/${String(body.action)} answered ${status}: ${text}`);
    }
    return { status, body: JSON.parse(text) as unknown };
  }
  if (error) throw error;
  return { status: 200, body: data as unknown };
}

export async function userIdOf(client: Client): Promise<string> {
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error('not signed in');
  return data.user.id;
}
