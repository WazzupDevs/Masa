import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

export const gameEventsKey = (roomId: string) => ['gameEvents', roomId] as const;

// Clues, guesses and closed cards of the room (RLS), live through Postgres Changes. A card's word
// only ever appears here in its card_closed event.
export function useGameEvents(roomId: string, onEvent?: () => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`game:${roomId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_id=eq.${roomId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: gameEventsKey(roomId) });
          onEvent?.();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, queryClient, onEvent]);

  return useQuery({
    queryKey: gameEventsKey(roomId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_events')
        .select('id, type, session_id, payload, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });
}
