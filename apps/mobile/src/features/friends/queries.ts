import { totalUnread, withThreadRead } from '@shared/dmInbox.ts';
import type { DmInboxThread } from '@shared/api/friends.ts';
import { BROADCAST, inboxChannel } from '@shared/rooms.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { useBroadcast } from '@/features/rooms/useBroadcast';
import { dmApi, friendsApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export const friendKeys = {
  all: ['friends'] as const,
  list: ['friends', 'list'] as const,
  incoming: ['friends', 'incoming'] as const,
  incomingChat: ['friends', 'incomingChat'] as const,
  sent: ['friends', 'sent'] as const,
  history: ['friends', 'history'] as const,
  inbox: ['friends', 'inbox'] as const,
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

// Requests from the venue chat (docs/SPEC_V3.md §7.5): the sender's name, age and photo, signed
// by the function. Under friendKeys.all, so the inbox broadcast refreshes them too.
export function useVenueChatRequests() {
  return useQuery({
    queryKey: friendKeys.incomingChat,
    queryFn: async () => (await friendsApi.incoming()).requests,
  });
}

// Requests sent from the venue chat: the name the other side showed; declined stays pending.
export function useSentVenueChatRequests() {
  return useQuery({
    queryKey: [...friendKeys.sent, 'venueChat'] as const,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_sent_venue_chat_requests');
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

// Mesajlar (docs/SPEC_V3.md §18.3): every friend, newest conversation first. Under friendKeys.all,
// so the inbox broadcast refreshes it.
export function useDmInbox() {
  return useQuery({
    queryKey: friendKeys.inbox,
    queryFn: async () => (await dmApi.inbox()).threads,
  });
}

// The Mesajlar tab's badge.
export function useUnreadTotal(): number {
  const inbox = useDmInbox();
  return totalUnread(inbox.data ?? []);
}

// The requests waiting for the caller (the bell's badge): from play history and the venue chat.
export function useRequestCount(): number {
  const incoming = useIncomingFriendRequests();
  const chatIncoming = useVenueChatRequests();
  return (incoming.data?.length ?? 0) + (chatIncoming.data?.length ?? 0);
}

// dm/read for a conversation the caller is looking at, then the Mesajlar badge: the thread's row in
// the cached inbox drops to nothing unread at once, and the inbox and the friends list are read
// again (step 9: the badge stayed red because only the list was refreshed).
export function useMarkThreadRead(threadId: string): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void dmApi
      .read(threadId)
      .then(() => {
        queryClient.setQueryData<DmInboxThread[]>(friendKeys.inbox, (threads) =>
          threads ? withThreadRead(threads, threadId) : threads,
        );
        void queryClient.invalidateQueries({ queryKey: friendKeys.inbox });
        void queryClient.invalidateQueries({ queryKey: friendKeys.list });
      })
      .catch(() => undefined);
  }, [queryClient, threadId]);
}

// Newest first, 50 at a time (dm_messages_page), with the status of the caller's own messages.
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

// Ticks (docs/SPEC_V3.md §18.2): while the app is open, the messages it has been told about count
// as delivered. Called on mount, when the app comes to the foreground and on an inbox DM
// broadcast, at most once per DELIVERED_DEBOUNCE_MS. With the app closed nothing is delivered.
const DELIVERED_DEBOUNCE_MS = 1000;

function useMarkDelivered(): () => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mark = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void dmApi.delivered().catch(() => undefined);
    }, DELIVERED_DEBOUNCE_MS);
  }, []);
  useEffect(() => {
    mark();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') mark();
    });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [mark]);
  return mark;
}

// The account's inbox channel: requests, friendships and DMs refetch when told to. Mounted once,
// in the tab layout, so the Mesajlar and bell badges stay current.
export function useInbox(): void {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  const markDelivered = useMarkDelivered();
  const refetch = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: friendKeys.all }),
    [queryClient],
  );
  const onDm = useCallback(() => {
    refetch();
    markDelivered();
  }, [refetch, markDelivered]);
  const topic = userId ? inboxChannel(userId) : null;
  useBroadcast(topic, BROADCAST.friendRequest, refetch);
  useBroadcast(topic, BROADCAST.friendshipChanged, refetch);
  useBroadcast(topic, BROADCAST.dm, onDm);
}
