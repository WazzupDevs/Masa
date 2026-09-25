import type { SupabaseClient } from '@supabase/supabase-js';

import {
  POSTHOG_DEFAULT_API_HOST,
  posthogPersonDeleteUrl,
  posthogPersonIds,
  posthogPersonLookupUrl,
} from '../../supabase/functions/_shared/pure/analytics.ts';
import type { Database } from '../../supabase/functions/_shared/pure/database.ts';
import { deleteProfilePhotos, publicIdOf } from './photos.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUserId(value: string): boolean {
  return UUID.test(value);
}

// Ban = keep the phone hash, delete the account and its profile photos. Needs a secret-key
// (admin) client.
// The hash is written first: if the deletion fails, re-running is safe and the number can
// already no longer sign up. Deleting cascades to all of the user's data; the sign-up hook
// rejects the number afterwards.
export async function banUser(admin: SupabaseClient<Database>, userId: string): Promise<void> {
  const hash = await admin.rpc('record_banned_phone', { target_user_id: userId });
  if (hash.error) throw hash.error;

  // End the table first so its rooms close or go back to waiting for the other table.
  const ended = await admin.rpc('end_table_session', { target_user_id: userId });
  if (ended.error) throw ended.error;

  // Photos before the account: the profile row holds the folder name.
  const publicId = await publicIdOf(admin, userId);
  if (publicId) await deleteProfilePhotos(admin, publicId);

  const deletion = await admin.auth.admin.deleteUser(userId);
  if (deletion.error) throw deletion.error;
}

// Same as the account function: with POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID set, the
// banned (deleted) account's PostHog person and events go too.
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
