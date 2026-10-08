import { BROADCAST, messagesChannel } from '@shared/rooms.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { privateChannel, useChannel } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';

export const messagesKey = (roomId: string) => ['messages', roomId] as const;
// Under messagesKey: a new message refreshes the quotes and reactions too.
const extrasKey = (roomId: string) => ['messages', roomId, 'extras'] as const;

// Room messages the table may read (RLS), kept live with Postgres Changes. The server's data-free
// `reaction` broadcast on the same channel (docs/SPEC_V3.md §21.3) reads them again too.
export function useMessages(roomId: string) {
  const queryClient = useQueryClient();

  useChannel(
    messagesChannel(roomId),
    (emit) => ({
      channel: privateChannel(messagesChannel(roomId))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          () => emit(null),
        )
        .on('broadcast', { event: BROADCAST.reaction }, () => emit(null)),
    }),
    () => void queryClient.invalidateQueries({ queryKey: messagesKey(roomId) }),
  );

  return useQuery({
    queryKey: messagesKey(roomId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, session_id, sender_alias, body, created_at, reply_to_id, replied')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data.reverse();
    },
  });
}

// Quotes and reactions of the room's messages, keyed by message id (room_chat_extras: table
// aliases only, never an account id).
export function useRoomChatExtras(roomId: string) {
  return useQuery({
    queryKey: extrasKey(roomId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('room_chat_extras', { target_room_id: roomId });
      if (error) throw error;
      return new Map(data.map((row) => [row.message_id, row]));
    },
  });
}
