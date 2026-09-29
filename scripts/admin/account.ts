import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../supabase/functions/_shared/pure/database.ts';
import { deleteProfilePhotos, publicIdOf } from './photos.ts';

// The account function's `delete` action, step for step, with a secret-key (admin) client: used
// by `admin:delete` (a deletion request by e-mail) and by a ban after the phone hash is kept.
// Deleting the auth user cascades to every row of the account (account.test.ts checks the foreign
// keys). The PostHog person goes separately (deletePosthogPerson), as in the function.
export async function deleteAccount(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  // End the table first so its rooms close or go back to waiting for the other table.
  const ended = await admin.rpc('end_table_session', { target_user_id: userId });
  if (ended.error) throw ended.error;

  // Photos before the account: the profile row holds the folder name.
  const publicId = await publicIdOf(admin, userId);
  if (publicId) await deleteProfilePhotos(admin, publicId);

  const deletion = await admin.auth.admin.deleteUser(userId);
  if (deletion.error) throw deletion.error;
}
