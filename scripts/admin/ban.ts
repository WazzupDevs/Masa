import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../supabase/functions/_shared/pure/database.ts';

// ~100 years: Supabase Auth has no permanent ban, only a duration.
export const PERMANENT_BAN_DURATION = '876000h';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUserId(value: string): boolean {
  return UUID.test(value);
}

// Needs a secret-key (admin) client. Setting profiles.is_banned fires the trigger that stores the
// phone hash; the Auth ban blocks sign-in and token refresh.
export async function banUser(admin: SupabaseClient<Database>, userId: string): Promise<void> {
  const { data, error } = await admin
    .from('profiles')
    .update({ is_banned: true })
    .eq('id', userId)
    .select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error(`No profile for user ${userId}`);

  const ban = await admin.auth.admin.updateUserById(userId, {
    ban_duration: PERMANENT_BAN_DURATION,
  });
  if (ban.error) throw ban.error;
}
