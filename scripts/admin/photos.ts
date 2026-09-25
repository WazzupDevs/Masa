import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../supabase/functions/_shared/pure/database.ts';
import { PHOTO_BUCKET } from '../../supabase/functions/_shared/pure/profile.ts';

type Admin = SupabaseClient<Database>;

// Every profile photo of an account ({public_id}/ in the bucket). Storage objects are not removed
// by foreign keys, so a ban deletes them explicitly (the account function does the same).
export async function deleteProfilePhotos(admin: Admin, publicId: string): Promise<void> {
  const bucket = admin.storage.from(PHOTO_BUCKET);
  const { data, error } = await bucket.list(publicId, { limit: 1000 });
  if (error) throw error;
  if (data.length === 0) return;
  const removed = await bucket.remove(data.map((f) => `${publicId}/${f.name}`));
  if (removed.error) throw removed.error;
}

export async function publicIdOf(admin: Admin, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('public_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.public_id ?? null;
}

// `pnpm admin:remove-photo <publicId>` after a report review (docs/SPEC_V2.md §5.3): deletes the
// current photo and empties photo_path. Report copies stay until their 30 days end. Returns false
// if the profile had no photo.
export async function removeProfilePhoto(admin: Admin, publicId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('profiles')
    .select('photo_path')
    .eq('public_id', publicId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No profile with public id ${publicId}`);
  if (!data.photo_path) return false;

  const removed = await admin.storage.from(PHOTO_BUCKET).remove([data.photo_path]);
  if (removed.error) throw removed.error;
  // Only if the owner has not committed another photo meanwhile.
  const updated = await admin
    .from('profiles')
    .update({ photo_path: null, photo_hidden_at: null })
    .eq('public_id', publicId)
    .eq('photo_path', data.photo_path);
  if (updated.error) throw updated.error;
  return true;
}
