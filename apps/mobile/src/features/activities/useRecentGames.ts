import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

const RECENT = 5;

export type RecentGame = {
  id: string;
  concept: 'tabu' | 'sohbet' | 'sahtekar' | 'harf' | 'sarki' | 'ibre';
  completedAt: string;
  score: number | null;
  won: boolean | null;
  // The other table's alias from the caller's own play history (once its row is available).
  otherAlias: string | null;
};

// "Son oyunların" on Aktiviteler (docs/SPEC_V3.md §18.3): the caller's own game_results (RLS: own
// rows only) and the other table's alias from the caller's own play_history. Nothing about the
// other side beyond what the history already shows.
export function useRecentGames() {
  return useQuery({
    queryKey: ['recentGames'],
    queryFn: async (): Promise<RecentGame[]> => {
      const { data, error } = await supabase
        .from('game_results')
        .select('id, room_id, concept, completed_at, score, won')
        .order('completed_at', { ascending: false })
        .limit(RECENT);
      if (error) throw error;
      const roomIds = data.map((g) => g.room_id).filter((id): id is string => !!id);
      const aliases = new Map<string, string>();
      if (roomIds.length > 0) {
        const history = await supabase
          .from('play_history')
          .select('room_id, other_alias')
          .in('room_id', roomIds);
        if (history.error) throw history.error;
        for (const h of history.data) if (h.room_id) aliases.set(h.room_id, h.other_alias);
      }
      return data.map((g) => ({
        id: g.id,
        concept:
          (['sohbet', 'sahtekar', 'harf', 'sarki', 'ibre'] as const).find((c) => c === g.concept) ??
          'tabu',
        completedAt: g.completed_at,
        score: g.score,
        won: g.won,
        otherAlias: g.room_id ? (aliases.get(g.room_id) ?? null) : null,
      }));
    },
  });
}
