import {
  VENUE_CHAT_BROADCAST,
  type VenueChatMessage,
  venueChatChannel,
} from '@shared/venueChat.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useBroadcast } from '@/features/rooms/useBroadcast';
import { profileApi, venueChatApi } from '@/lib/api';

export const venueChatKeys = {
  messages: (venueId: string) => ['venueChat', venueId] as const,
  profile: (messageId: string) => ['venueChatProfile', messageId] as const,
};

// The venue chat, oldest first for the screen (venue-chat/page returns newest first, with the
// photos of profiled messages signed). Refetched on the data-free `venue_chat` broadcast; empty
// without a live table at the venue.
export function useVenueChat(venueId: string | undefined) {
  const queryClient = useQueryClient();
  const refetch = useCallback(() => {
    if (venueId) void queryClient.invalidateQueries({ queryKey: venueChatKeys.messages(venueId) });
  }, [queryClient, venueId]);
  useBroadcast(venueId ? venueChatChannel(venueId) : null, VENUE_CHAT_BROADCAST, refetch);

  return useQuery({
    queryKey: venueChatKeys.messages(venueId ?? ''),
    enabled: venueId !== undefined,
    queryFn: async (): Promise<VenueChatMessage[]> =>
      (await venueChatApi.page(venueId ?? '')).messages.reverse(),
  });
}

// The sender of a profiled message, opened through the message (no public_id).
export function useVenueChatProfile(messageId: string | undefined) {
  return useQuery({
    queryKey: venueChatKeys.profile(messageId ?? ''),
    enabled: !!messageId,
    retry: false,
    queryFn: () => profileApi.getFromVenueChat(messageId ?? ''),
  });
}
