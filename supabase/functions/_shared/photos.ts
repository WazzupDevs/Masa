import type { Db } from './auth.ts';
import { PHOTO_BUCKET } from './pure/profile.ts';

// Deletes every profile photo of an account (account deletion and ban): Storage objects are not
// removed by foreign keys, so they go explicitly.
export async function deleteProfilePhotos(db: Db, publicId: string): Promise<void> {
  const bucket = db.storage.from(PHOTO_BUCKET);
  const { data, error } = await bucket.list(publicId, { limit: 1000 });
  if (error) throw new Error(`storage list failed (${error.message})`);
  if (data.length === 0) return;
  const removed = await bucket.remove(data.map((f) => `${publicId}/${f.name}`));
  if (removed.error) throw new Error(`storage remove failed (${removed.error.message})`);
}
