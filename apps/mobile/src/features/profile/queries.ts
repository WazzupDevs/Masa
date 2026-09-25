import { useQuery } from '@tanstack/react-query';

import { profileApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export const profileViewKeys = {
  all: ['profileView'] as const,
  view: (publicId: string) => ['profileView', publicId] as const,
  roomMember: (roomId: string) => ['roomMemberProfile', roomId] as const,
};

// A profile as profile/get returns it: the caller's own, a friend's, or the other table's in the
// current room. Not kept after the screen closes (access can end with the room), and refetched
// well before the one-hour photo URL expires.
export function useProfileView(publicId: string | null | undefined) {
  return useQuery({
    queryKey: profileViewKeys.view(publicId ?? ''),
    enabled: !!publicId,
    staleTime: 10 * 60_000,
    gcTime: 0,
    retry: false,
    queryFn: () => profileApi.get(publicId ?? ''),
  });
}

// The other table's profile id while the room runs, only if it joined with its profile
// (docs/SPEC_V2.md §5.4); null otherwise.
export function useRoomMemberProfile(roomId: string, guestSessionId: string | null) {
  return useQuery({
    queryKey: [...profileViewKeys.roomMember(roomId), guestSessionId],
    enabled: guestSessionId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('room_member_profile', {
        target_room_id: roomId,
      });
      if (error) throw error;
      return data ? data : null;
    },
  });
}
