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

// A reported photo as hex bytea for the report row (docs/SPEC_V2.md §5.3: the copy lives in
// reports.photo_copy and goes with the row after 30 days). undefined if it cannot be read.
export async function photoCopyHex(db: Db, path: string | null): Promise<string | undefined> {
  if (!path) return undefined;
  const file = await db.storage.from(PHOTO_BUCKET).download(path);
  if (file.error) return undefined;
  let hex = '\\x';
  for (const b of new Uint8Array(await file.data.arrayBuffer())) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}
