import { useQuery } from '@tanstack/react-query';

import { useSessionStore } from '@/features/auth/session';
import { supabase } from '@/lib/supabase';

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const;

// The caller's own profile row (RLS: own row; the photo comes from profile/get as a signed URL).
export function useProfile() {
  const userId = useSessionStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: profileQueryKey(userId),
    enabled: userId !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'terms_version, kvkk_version, location_consent_version, public_id, display_name, bio, default_participation, notify_dm, notify_friend_requests',
        )
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
