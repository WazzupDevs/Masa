import { router } from 'expo-router';

// A DM lives under Mesajlar (docs/SPEC_V3.md §18.3), whichever screen opens it. The friend's photo
// is not in the route (its signed URL expires); the DM reads it from the friend list.
export function openDm(friend: { threadId: string; publicId: string; name: string | null }): void {
  router.navigate({
    pathname: '/messages/[threadId]',
    params: { threadId: friend.threadId, publicId: friend.publicId, name: friend.name ?? '' },
  });
}
