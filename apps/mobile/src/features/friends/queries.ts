import { BROADCAST, inboxChannel } from '@shared/rooms.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useSessionStore } from '@/features/auth/session';
import { useBroadcast } from '@/features/rooms/useBroadcast';
import { friendsApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export const friendKeys = {
  all: ['friends'] as const,
  list: ['friends', 'list'] as const,
  incoming: ['friends', 'incoming'] as const,
  sent: ['friends', 'sent'] as const,
  history: ['friends', 'history'] as const,
  dm: (threadId: string) => ['friends', 'dm', threadId] as const,
};

export function useFriends() {
  return useQuery({
    queryKey: friendKeys.list,
    queryFn: async () => (await friendsApi.list()).friends,
  });
}

export function useIncomingFriendRequests() {
  return useQuery({
    queryKey: friendKeys.incoming,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_incoming_requests');
      if (error) throw error;
      return data;
    },
  });
}

export function useSentFriendRequests() {
  return useQuery({
    queryKey: friendKeys.sent,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_sent_requests');
      if (error) throw error;
      return data;
    },
  });
}

// The caller's own encounters (RLS: own rows once available; no id of the other side).
export function usePlayHistory() {
  return useQuery({
    queryKey: friendKeys.history,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('play_history')
        .select(
          'id, room_id, concept, own_alias, other_alias, other_headcount, reveal_mutual, friend_action_at, played_at',
        )
        .order('played_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}

// Newest first, 50 at a time (dm_messages_page).
export function useDmMessages(threadId: string) {
  return useQuery({
    queryKey: friendKeys.dm(threadId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dm_messages_page', {
        target_thread_id: threadId,
      });
      if (error) throw error;
      return data;
    },
  });
}

// The account's inbox channel: requests, friendships and DMs refetch when told to. Mounted once,
// in the tab layout, so the Arkadaşlar badge stays current.
export function useInbox(): void {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  const refetch = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: friendKeys.all }),
    [queryClient],
  );
  const topic = userId ? inboxChannel(userId) : null;
  useBroadcast(topic, BROADCAST.friendRequest, refetch);
  useBroadcast(topic, BROADCAST.friendshipChanged, refetch);
  useBroadcast(topic, BROADCAST.dm, refetch);
}
