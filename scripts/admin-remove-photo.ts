// Usage: pnpm admin:remove-photo <publicId>
// Developer machine only. Needs SUPABASE_URL and SUPABASE_SECRET_KEY in the environment
// (Supabase dashboard → Settings → API Keys). The secret key never goes into the app.
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../supabase/functions/_shared/pure/database.ts';
import { isUserId } from './admin/ban.ts';
import { removeProfilePhoto } from './admin/photos.ts';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const publicId = process.argv[2];
if (!publicId || !isUserId(publicId)) {
  console.error('Usage: pnpm admin:remove-photo <publicId>');
  process.exit(1);
}

const admin = createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const removed = await removeProfilePhoto(admin, publicId);
console.log(removed ? `Removed the photo of ${publicId}` : `${publicId} has no photo`);
