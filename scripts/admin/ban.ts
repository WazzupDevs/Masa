import type { SupabaseClient } from '@supabase/supabase-js';

import {
  POSTHOG_DEFAULT_API_HOST,
  posthogPersonDeleteUrl,
  posthogPersonIds,
  posthogPersonLookupUrl,
} from '../../supabase/functions/_shared/pure/analytics.ts';
import type { Database } from '../../supabase/functions/_shared/pure/database.ts';
import { deleteAccount } from './account.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUserId(value: string): boolean {
  return UUID.test(value);
}

// Ban = keep the phone hash, then delete the account exactly as a deletion does (deleteAccount).
// Needs a secret-key (admin) client. The hash is written first: if the deletion fails, re-running
// is safe and the number can already no longer sign up; the sign-up hook rejects it afterwards.
export async function banUser(admin: SupabaseClient<Database>, userId: string): Promise<void> {
  const hash = await admin.rpc('record_banned_phone', { target_user_id: userId });
  if (hash.error) throw hash.error;
  await deleteAccount(admin, userId);
}

// Same as the account function: with POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID set, the
// deleted (or banned) account's PostHog person and events go too.
export async function deletePosthogPerson(
  userId: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const key = env.POSTHOG_PERSONAL_API_KEY;
  const projectId = env.POSTHOG_PROJECT_ID;
  if (!key || !projectId) return false;
  const host = env.POSTHOG_HOST ?? POSTHOG_DEFAULT_API_HOST;
  const headers = { authorization: `Bearer ${key}` };
  const lookup = await fetch(posthogPersonLookupUrl(host, projectId, userId), { headers });
  if (!lookup.ok) throw new Error(`PostHog lookup failed (${lookup.status})`);
  for (const personId of posthogPersonIds(await lookup.json())) {
    const res = await fetch(posthogPersonDeleteUrl(host, projectId, personId), {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(`PostHog delete failed (${res.status})`);
  }
  return true;
}
