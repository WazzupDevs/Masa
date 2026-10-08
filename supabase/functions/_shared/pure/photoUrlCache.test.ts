import { describe, expect, it } from 'vitest';

import {
  cachedUrl,
  CLIENT_KEEP_MS,
  type PhotoUrlCache,
  remember,
  SERVER_REUSE_MS,
  stablePhotoUrl,
} from './photoUrlCache.ts';
import { PHOTO_URL_SECONDS } from './profile.ts';

const signed = (path: string, token: string) =>
  `https://x.supabase.co/storage/v1/object/sign/profile-photos/${path}?token=${token}`;

describe('photo URL cache', () => {
  it('keeps a URL the app gets well inside the life the server guarantees', () => {
    expect(SERVER_REUSE_MS).toBe((PHOTO_URL_SECONDS * 1000) / 2);
    expect(CLIENT_KEEP_MS).toBeLessThan(PHOTO_URL_SECONDS * 1000 - SERVER_REUSE_MS);
  });

  it('gives the app the first URL of a file until it ages out, then the new one', () => {
    const cache: PhotoUrlCache = new Map();
    const first = signed('p1/a.jpg', 'one');
    expect(stablePhotoUrl(cache, first, 0)).toBe(first);
    expect(stablePhotoUrl(cache, signed('p1/a.jpg', 'two'), CLIENT_KEEP_MS - 1)).toBe(first);
    const third = signed('p1/a.jpg', 'three');
    expect(stablePhotoUrl(cache, third, CLIENT_KEEP_MS)).toBe(third);
    // Another file (a new photo) is never answered with the old one.
    const other = signed('p1/b.jpg', 'four');
    expect(stablePhotoUrl(cache, other, CLIENT_KEEP_MS)).toBe(other);
    expect(stablePhotoUrl(cache, null, 0)).toBeNull();
  });

  it('answers a server lookup only before the entry ends, and drops ended entries when full', () => {
    const cache: PhotoUrlCache = new Map();
    remember(cache, 'p1/a.jpg', 'u1', 0, SERVER_REUSE_MS);
    expect(cachedUrl(cache, 'p1/a.jpg', SERVER_REUSE_MS - 1)).toBe('u1');
    expect(cachedUrl(cache, 'p1/a.jpg', SERVER_REUSE_MS)).toBeNull();
    expect(cachedUrl(cache, 'p2/a.jpg', 0)).toBeNull();

    for (let i = 0; i < 1000; i += 1) remember(cache, `old/${i}`, 'x', 0, 10);
    remember(cache, 'fresh', 'y', 20, 10);
    expect(cache.has('old/1')).toBe(false);
    expect(cache.get('fresh')).toEqual({ url: 'y', until: 30 });
  });
});
