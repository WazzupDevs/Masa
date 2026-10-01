import {
  VENUE_CHAT,
  VENUE_CHAT_BROADCAST,
  type VenueChatMessage,
  venueChatChannel,
} from '@shared/venueChat.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useBroadcast } from '@/features/rooms/useBroadcast';
import { profileApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export const venueChatKeys = {
  messages: (venueId: string) => ['venueChat', venueId] as const,
  profile: (messageId: string) => ['venueChatProfile', messageId] as const,
};

// The venue chat, oldest first for the screen (venue_chat_page returns newest first). Refetched
// on the data-free `venue_chat` broadcast; empty without a live table at the venue.
export function useVenueChat(venueId: string | undefined) {
  const queryClient = useQueryClient();
  const refetch = useCallback(() => {
    if (venueId) void queryClient.invalidateQueries({ queryKey: venueChatKeys.messages(venueId) });
  }, [queryClient, venueId]);
  useBroadcast(venueId ? venueChatChannel(venueId) : null, VENUE_CHAT_BROADCAST, refetch);

  return useQuery({
    queryKey: venueChatKeys.messages(venueId ?? ''),
    enabled: venueId !== undefined,
    queryFn: async (): Promise<VenueChatMessage[]> => {
      const { data, error } = await supabase.rpc('venue_chat_page', {
        target_venue_id: venueId ?? '',
        page_size: VENUE_CHAT.pageSize,
      });
      if (error) throw error;
      return data
        .map((m) => ({
          id: m.id,
          profiled: m.profiled,
          senderAlias: m.sender_alias,
          displayName: m.display_name,
          body: m.body,
          createdAt: m.created_at,
          fromMe: m.from_me,
        }))
        .reverse();
    },
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
