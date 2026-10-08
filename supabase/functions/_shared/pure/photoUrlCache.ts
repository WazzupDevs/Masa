// Signed profile photo URLs reused until shortly before they expire (adım 9.1). Signing again on
// every read costs a Storage call on the server and a new download on the phone (a new token is a
// new URL to the image cache). Who may see a photo is still decided on each read: a URL is reused
// only when the read hands out that path again.
import { PHOTO_URL_SECONDS } from './profile.ts';

export type PhotoUrlCache = Map<string, { url: string; until: number }>;

// The server reuses a URL for the first half of its life, so any URL it hands out has at least
// half an hour left; the app keeps a URL a little less than that.
export const SERVER_REUSE_MS = (PHOTO_URL_SECONDS * 1000) / 2;
export const CLIENT_KEEP_MS = SERVER_REUSE_MS - 5 * 60 * 1000;
// Above this many entries the expired ones are dropped.
const MAX_ENTRIES = 1000;

export function cachedUrl(cache: PhotoUrlCache, key: string, now: number): string | null {
  const hit = cache.get(key);
  return hit && hit.until > now ? hit.url : null;
}

export function remember(
  cache: PhotoUrlCache,
  key: string,
  url: string,
  now: number,
  keepMs: number,
): void {
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
  }
  cache.set(key, { url, until: now + keepMs });
}

// The app's side: the first URL seen for a file (the URL without its token) until CLIENT_KEEP_MS
// has passed. null stays null (no photo, or hidden).
export function stablePhotoUrl(
  cache: PhotoUrlCache,
  url: string | null,
  now: number,
): string | null {
  if (!url) return null;
  const key = url.split('?')[0] ?? url;
  const kept = cachedUrl(cache, key, now);
  if (kept) return kept;
  remember(cache, key, url, now, CLIENT_KEEP_MS);
  return url;
}
