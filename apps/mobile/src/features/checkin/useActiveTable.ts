import { useQuery } from '@tanstack/react-query';

import { useSessionStore } from '@/features/auth/session';
import { supabase } from '@/lib/supabase';

export const activeTableQueryKey = (userId: string | undefined) => ['activeTable', userId] as const;

// The user's open table, if any (RLS: own rows only).
export function useActiveTable() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: activeTableQueryKey(userId),
    enabled: userId !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('table_sessions')
        .select('id, alias, headcount, expires_at, venue:venues(name)')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
