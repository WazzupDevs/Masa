import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

export const messagesKey = (roomId: string) => ['messages', roomId] as const;

// Room messages the table may read (RLS), kept live with Postgres Changes.
export function useMessages(roomId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${roomId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        () => void queryClient.invalidateQueries({ queryKey: messagesKey(roomId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, queryClient]);

  return useQuery({
    queryKey: messagesKey(roomId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, session_id, sender_alias, body, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data.reverse();
    },
  });
}
