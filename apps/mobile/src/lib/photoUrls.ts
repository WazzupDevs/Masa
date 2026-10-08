import { type PhotoUrlCache, stablePhotoUrl } from '@shared/photoUrlCache.ts';

// One cache for the app: a profile photo keeps the URL it was first shown with until it ages out,
// so a list read again does not download the same photo again (@shared/photoUrlCache.ts).
const cache: PhotoUrlCache = new Map();

export function stablePhoto(url: string | null): string | null {
  return stablePhotoUrl(cache, url, Date.now());
}
