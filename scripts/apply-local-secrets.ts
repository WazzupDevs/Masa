// Applies supabase/local/secrets.sql to the LOCAL Supabase database only. Part of `pnpm db:reset`.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const status = execSync('pnpm -s supabase status -o env', { cwd: root, encoding: 'utf8' });
const dbUrl = status.match(/^DB_URL="?([^"\n]+)"?$/m)?.[1];
if (!dbUrl) throw new Error('No DB_URL from `supabase status`; is the local stack running?');

const host = new URL(dbUrl).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error(`Refusing to apply local secrets to non-local database host ${host}`);
}

const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
try {
  await sql.unsafe(readFileSync(resolve(root, 'supabase/local/secrets.sql'), 'utf8'));
  console.log('Applied supabase/local/secrets.sql to the local database');
} finally {
  await sql.end();
}
