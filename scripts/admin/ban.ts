import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../supabase/functions/_shared/pure/database.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUserId(value: string): boolean {
  return UUID.test(value);
}

// Ban = keep the phone hash, delete the account. Needs a secret-key (admin) client.
// The hash is written first: if the deletion fails, re-running is safe and the number can
// already no longer sign up. Deleting cascades to all of the user's data; the sign-up hook
// rejects the number afterwards.
export async function banUser(admin: SupabaseClient<Database>, userId: string): Promise<void> {
  const hash = await admin.rpc('record_banned_phone', { target_user_id: userId });
  if (hash.error) throw hash.error;

  const deletion = await admin.auth.admin.deleteUser(userId);
  if (deletion.error) throw deletion.error;
}
