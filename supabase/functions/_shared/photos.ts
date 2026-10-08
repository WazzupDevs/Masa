import type { Db } from './auth.ts';
import { cachedUrl, type PhotoUrlCache, remember, SERVER_REUSE_MS } from './pure/photoUrlCache.ts';
import { PHOTO_BUCKET, PHOTO_URL_SECONDS } from './pure/profile.ts';

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

// Profile photo URLs for the given paths, signed for an hour (photos are private; only Edge
// Functions sign them). Keyed by path. A path signed in this isolate during the last half hour is
// answered with the same URL (pure/photoUrlCache.ts): no Storage call, and the phone does not
// download the photo again. The caller has already decided that the reader may see each path.
const signedUrls: PhotoUrlCache = new Map();

export async function signPhotos(db: Db, paths: readonly string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const now = Date.now();
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const hit = cachedUrl(signedUrls, path, now);
    if (hit) urls.set(path, hit);
    else missing.push(path);
  }
  if (missing.length === 0) return urls;
  const signed = await db.storage.from(PHOTO_BUCKET).createSignedUrls(missing, PHOTO_URL_SECONDS);
  if (signed.error) throw new Error(`storage sign failed (${signed.error.message})`);
  for (const s of signed.data) {
    if (!s.path || !s.signedUrl) continue;
    urls.set(s.path, s.signedUrl);
    remember(signedUrls, s.path, s.signedUrl, now, SERVER_REUSE_MS);
  }
  return urls;
}
