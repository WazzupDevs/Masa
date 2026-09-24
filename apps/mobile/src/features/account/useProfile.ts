import { useQuery } from '@tanstack/react-query';

import { useSessionStore } from '@/features/auth/session';
import { supabase } from '@/lib/supabase';

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const;

export function useProfile() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: profileQueryKey(userId),
    enabled: userId !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('terms_version, kvkk_version, location_consent_version')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
