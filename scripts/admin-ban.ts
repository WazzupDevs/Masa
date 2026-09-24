// Usage: pnpm admin:ban <userId>
// Developer machine only. Needs SUPABASE_URL and SUPABASE_SECRET_KEY in the environment
// (Supabase dashboard → Settings → API Keys). The secret key never goes into the app.
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../supabase/functions/_shared/pure/database.ts';
import { banUser, isUserId } from './admin/ban.ts';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const userId = process.argv[2];
if (!userId || !isUserId(userId)) {
  console.error('Usage: pnpm admin:ban <userId>');
  process.exit(1);
}

const admin = createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

await banUser(admin, userId);
console.log(`Banned and deleted ${userId} on ${env('SUPABASE_URL')}`);
