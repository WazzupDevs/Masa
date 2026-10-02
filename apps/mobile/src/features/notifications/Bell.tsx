import { router } from 'expo-router';

import { BellButton } from '@/components/BellButton';
import { useRequestCount } from '@/features/friends/queries';

// The bell at the top right of each tab's root screen (docs/SPEC_V3.md §18.3): the count is the
// requests waiting for the caller (play history and venue chat); it opens Bildirimler. Not shown
// in a DM, a room, the venue chat or the check-in flow (none of them is a tab root).
export function NotificationsBell() {
  const count = useRequestCount();
  return <BellButton count={count} onPress={() => router.push('/notifications')} testID="bell" />;
}
