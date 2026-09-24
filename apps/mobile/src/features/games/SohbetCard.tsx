import type { SohbetState } from '@shared/sohbet.ts';
import { useMutation } from '@tanstack/react-query';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

// The current conversation card; either table deals the next one (MVP_SPEC §5.3). The new card
// reaches both phones through the room's Postgres Changes.
export function SohbetCard({ roomId, state }: { roomId: string; state: SohbetState | null }) {
  const now = useNow(500);
  const next = useMutation({ mutationFn: () => gamesApi.sohbetNext(roomId) });
  const waitMs = state ? Date.parse(state.nextAllowedAt) - now : 0;
  const waitS = Math.max(0, Math.ceil(waitMs / 1000));

  return (
    <View className="items-center gap-4">
      {state ? (
        <>
          <Text className="text-sm font-semibold text-neutral-500">
            {tr.games.themes[state.theme]}
          </Text>
          <Text className="text-center text-2xl font-semibold text-black">{state.prompt}</Text>
        </>
      ) : null}
      {next.isError ? (
        <Text className="text-sm text-red-600">{errorMessage(next.error)}</Text>
      ) : null}
      <View className="w-full">
        <Button
          label={
            state
              ? waitS > 0
                ? tr.games.sohbetWait(waitS)
                : tr.games.sohbetNext
              : tr.games.sohbetFirst
          }
          onPress={() => next.mutate()}
          disabled={waitS > 0}
          loading={next.isPending}
        />
      </View>
    </View>
  );
}
