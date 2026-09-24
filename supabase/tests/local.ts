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
export const sql = postgres(value('DB_URL'), { max: 1, onnotice: () => {} });

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

// Calls an Edge Function; errors come back as { status, body } instead of throwing.
export async function invoke(
  client: Client,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const { data, error } = await client.functions.invoke(fn, { body });
  if (error instanceof FunctionsHttpError) {
    return { status: error.context.status as number, body: await error.context.json() };
  }
  if (error) throw error;
  return { status: 200, body: data as unknown };
}

export async function userIdOf(client: Client): Promise<string> {
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error('not signed in');
  return data.user.id;
}
