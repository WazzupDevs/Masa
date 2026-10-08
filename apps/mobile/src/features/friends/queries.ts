import type { DmInboxThread } from '@shared/api/friends.ts';
import { type DmPageRow, totalUnread, withSentDm, withThreadRead } from '@shared/dmInbox.ts';
import { BROADCAST, inboxChannel } from '@shared/rooms.ts';
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { useBroadcast } from '@/features/rooms/useBroadcast';
import { useReactions } from '@/features/chat/messageExtras';
import { dmApi, friendsApi } from '@/lib/api';
import { stablePhoto } from '@/lib/photoUrls';
import { supabase } from '@/lib/supabase';

export const friendKeys = {
  all: ['friends'] as const,
  list: ['friends', 'list'] as const,
  incoming: ['friends', 'incoming'] as const,
  incomingChat: ['friends', 'incomingChat'] as const,
  sent: ['friends', 'sent'] as const,
  history: ['friends', 'history'] as const,
  inbox: ['friends', 'inbox'] as const,
  dms: ['friends', 'dm'] as const,
  dm: (threadId: string) => ['friends', 'dm', threadId] as const,
};

export function useFriends() {
  return useQuery({
    queryKey: friendKeys.list,
    queryFn: async () =>
      (await friendsApi.list()).friends.map((f) => ({ ...f, photoUrl: stablePhoto(f.photoUrl) })),
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
    queryFn: async () =>
      (await friendsApi.incoming()).requests.map((r) => ({
        ...r,
        photoUrl: stablePhoto(r.photoUrl),
      })),
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
    queryFn: async () =>
      (await dmApi.inbox()).threads.map((t) => ({ ...t, photoUrl: stablePhoto(t.photoUrl) })),
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

// The inbox and the friends list (both sign photos) are read again at most once per
// INBOX_REFRESH_MS, however many DMs and reads come in meanwhile (adım 9.1: every message used to
// refetch every friends/* query). One timer for the app: the tab layout's inbox channel and the
// conversation's reads share it.
const INBOX_REFRESH_MS = 1000;
let inboxRefresh: ReturnType<typeof setTimeout> | null = null;

function refreshInboxSoon(queryClient: QueryClient): void {
  if (inboxRefresh) return;
  inboxRefresh = setTimeout(() => {
    inboxRefresh = null;
    void queryClient.invalidateQueries({ queryKey: friendKeys.inbox });
    void queryClient.invalidateQueries({ queryKey: friendKeys.list });
  }, INBOX_REFRESH_MS);
}

// dm/read for a conversation the caller is looking at, then the Mesajlar badge: the thread's row in
// the cached inbox drops to nothing unread at once, and the inbox and the friends list are read
// again soon (step 9: the badge stayed red because only the list was refreshed).
export function useMarkThreadRead(threadId: string): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void dmApi
      .read(threadId)
      .then(() => {
        queryClient.setQueryData<DmInboxThread[]>(friendKeys.inbox, (threads) =>
          threads ? withThreadRead(threads, threadId) : threads,
        );
        refreshInboxSoon(queryClient);
      })
      .catch(() => undefined);
  }, [queryClient, threadId]);
}

// Newest first, 50 at a time (dm_messages_page), with the status of the caller's own messages.
export function useDmMessages(threadId: string) {
  return useQuery({
    queryKey: friendKeys.dm(threadId),
    queryFn: async (): Promise<DmPageRow[]> => {
      const { data, error } = await supabase.rpc('dm_messages_page', {
        target_thread_id: threadId,
      });
      if (error) throw error;
      return data;
    },
  });
}

// Sends a DM. On the reply the message goes into the cached page with the 'sent' tick (adım 9.1:
// the clock used to wait for the page to be read again); the caller drops its waiting bubble then.
// A failure rejects with the ApiError, for "Tekrar dene".
export function useSendDm(
  threadId: string,
): (body: string, reply?: { id: string; body: string; fromMe: boolean }) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    async (body: string, reply?: { id: string; body: string; fromMe: boolean }) => {
      const sent = await dmApi.send(threadId, body, reply?.id);
      if (sent.messageId) {
        queryClient.setQueryData<DmPageRow[]>(friendKeys.dm(threadId), (page) =>
          withSentDm(page ?? [], {
            id: sent.messageId,
            body,
            created_at: sent.createdAt,
            // The quote as the page will send it (docs/SPEC_V3.md §21.1).
            ...(reply
              ? { reply_to: { id: reply.id, body: reply.body.slice(0, 80), from_me: reply.fromMe } }
              : {}),
          }),
        );
      } else {
        // A function from before this answer carried the message.
        await queryClient.invalidateQueries({ queryKey: friendKeys.dm(threadId) });
      }
      refreshInboxSoon(queryClient);
    },
    [queryClient, threadId],
  );
}

// docs/SPEC_V3.md §21.2: the reader's reaction shows at once; the page is read again after the
// server took it (and on the dm_reaction broadcast).
export function useDmReactions(threadId: string) {
  const queryClient = useQueryClient();
  return useReactions(dmApi.react, () =>
    queryClient.invalidateQueries({ queryKey: friendKeys.dm(threadId) }),
  );
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

// The account's inbox channel: requests and friendships refetch every friends/* query when told to.
// Mounted once, in the tab layout, so the Mesajlar and bell badges stay current. A DM refreshes only
// the inbox and the list, soon (refreshInboxSoon); the open conversation reads its own page on
// dm:{thread_id}, and the other pages are only marked stale, read when opened.
export function useInbox(): void {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.session?.user.id);
  const markDelivered = useMarkDelivered();
  const refetch = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: friendKeys.all }),
    [queryClient],
  );
  const onDm = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: friendKeys.dms, refetchType: 'none' });
    refreshInboxSoon(queryClient);
    markDelivered();
  }, [queryClient, markDelivered]);
  const topic = userId ? inboxChannel(userId) : null;
  useBroadcast(topic, BROADCAST.friendRequest, refetch);
  useBroadcast(topic, BROADCAST.friendshipChanged, refetch);
  useBroadcast(topic, BROADCAST.dm, onDm);
}
