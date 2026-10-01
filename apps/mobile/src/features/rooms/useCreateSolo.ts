import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { roomsApi } from '@/lib/api';

import { roomKeys } from './queries';

// "Masanla oyna" (docs/SPEC_V3.md §5.1): a private one-table room, anonymous, never in the lobby;
// the room screen then offers its games directly.
export function useCreateSolo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: roomsApi.createSolo,
    onSuccess: async ({ roomId }) => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.current });
      router.push({ pathname: '/room/[id]', params: { id: roomId } });
    },
  });
}
