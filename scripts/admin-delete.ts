// Usage: pnpm admin:delete <userId>
// A deletion request by e-mail (hesap-silme sayfası): deletes the account as "Hesabımı sil" in the
// app does (profile photos, the account and every row of it, the PostHog person). No ban: the
// number can sign up again. Find the user id in the dashboard (Authentication → Users, by phone).
// Developer machine only. Needs SUPABASE_URL and SUPABASE_SECRET_KEY in the environment
// (Supabase dashboard → Settings → API Keys). The secret key never goes into the app.
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../supabase/functions/_shared/pure/database.ts';
import { deleteAccount } from './admin/account.ts';
import { deletePosthogPerson, isUserId } from './admin/ban.ts';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const userId = process.argv[2];
if (!userId || !isUserId(userId)) {
  console.error('Usage: pnpm admin:delete <userId>');
  process.exit(1);
}

const admin = createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

await deleteAccount(admin, userId);
console.log(`Deleted ${userId} on ${env('SUPABASE_URL')}`);
if (await deletePosthogPerson(userId, process.env)) console.log('Deleted the PostHog person');
