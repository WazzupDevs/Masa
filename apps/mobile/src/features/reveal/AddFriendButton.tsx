import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { friendKeys } from '@/features/friends/queries';
import { useRetryAfterName } from '@/features/friends/useRetryAfterName';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { friendsApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// "Arkadaş ekle" on the mutual signal (docs/SPEC_V2.md §6.5). It works on the table's own history
// row of this room, which opens at once on a mutual "Evet". The answer is always the same; the
// other table never learns about a single press.
// Drawn on the signal's server colour: `foreground` is the readable colour on `background`.
export function AddFriendButton({
  roomId,
  background,
  foreground,
}: {
  roomId: string;
  background: string;
  foreground: string;
}) {
  const queryClient = useQueryClient();
  const row = useQuery({
    queryKey: [...friendKeys.history, 'room', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('play_history')
        .select('id, reveal_mutual, friend_action_at')
        .eq('room_id', roomId)
        .eq('reveal_mutual', true)
        .order('played_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: (historyId: string) => friendsApi.addFromRoom(historyId),
    onSuccess: () => track('friend_add_pressed', {}),
    onError: (err, historyId) => void askName(err, historyId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: friendKeys.all }),
  });
  const run = useCallback((historyId: string) => add.mutate(historyId), [add]);
  const askName = useRetryAfterName(run);

  const history = row.data;
  if (!history) return null;
  const done = history.friend_action_at !== null || add.isSuccess;
  return (
    <View className="w-full gap-2">
      {done ? (
        <Text
          variant="bodyStrong"
          color={foreground}
          align="center"
          accessibilityLiveRegion="polite"
        >
          {tr.reveal.addFriendDone}
        </Text>
      ) : (
        <Button
          tint={{ background: foreground, foreground: background }}
          label={tr.reveal.addFriend}
          loading={add.isPending}
          onPress={() => add.mutate(history.id)}
        />
      )}
      {add.isError ? (
        <Text variant="fine" color={foreground} align="center">
          {errorMessage(add.error)}
        </Text>
      ) : null}
    </View>
  );
}
