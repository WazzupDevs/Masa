import { createClient, type SupabaseClient, type User } from './deps.ts';
import type { Database } from './pure/database.ts';
import { AppError } from './pure/errors.ts';

export type Db = SupabaseClient<Database>;

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function serviceClient(): Db {
  return createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Validates the caller's access token with the Auth server.
export async function requireUser(req: Request, db: Db): Promise<User> {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new AppError('unauthorized', 'Missing access token.');

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new AppError('unauthorized', 'Invalid access token.');
  return data.user;
}
