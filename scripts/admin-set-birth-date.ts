// Usage: pnpm admin:set-birth-date <userId> <YYYY-MM-DD>
// Corrects a birth date entered wrongly at sign-up (docs/SPEC_V3.md §3.2); the app cannot change
// it. Under 18 is refused: that account is deleted with admin:delete instead. Developer machine
// only, with SUPABASE_URL and SUPABASE_SECRET_KEY in the environment; the secret key never goes
// into the app or a file.
import { createClient } from '@supabase/supabase-js';

import { checkBirthDate, isAdult, istanbulToday } from '../supabase/functions/_shared/pure/age.ts';
import type { Database } from '../supabase/functions/_shared/pure/database.ts';
import { isUserId } from './admin/ban.ts';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const [userId, raw] = process.argv.slice(2);
if (!userId || !isUserId(userId) || !raw) {
  console.error('Usage: pnpm admin:set-birth-date <userId> <YYYY-MM-DD>');
  process.exit(1);
}
const checked = checkBirthDate(raw, istanbulToday(new Date()));
if (!checked.ok) {
  console.error(`Invalid birth date (${checked.reason})`);
  process.exit(1);
}
if (!isAdult(checked.age)) {
  console.error('Under 18: delete the account with pnpm admin:delete instead.');
  process.exit(1);
}

const admin = createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin
  .from('profiles')
  .update({ birth_date: checked.value })
  .eq('id', userId)
  .select('id');
if (error) throw new Error(`profiles update failed (${error.code})`);
console.log(data.length === 1 ? `Birth date of ${userId} set` : `${userId} has no profile`);
