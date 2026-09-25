// Usage: pnpm admin:event add|list|remove (see scripts/admin/events.ts)
// Developer machine only. Needs SUPABASE_URL and SUPABASE_SECRET_KEY in the environment
// (Supabase dashboard → Settings → API Keys). The secret key never goes into the app.
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../supabase/functions/_shared/pure/database.ts';
import { parseEventCommand, runEventCommand } from './admin/events.ts';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

let command;
try {
  command = parseEventCommand(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const admin = createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(await runEventCommand(admin, command));
