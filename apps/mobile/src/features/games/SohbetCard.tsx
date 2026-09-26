import type { SohbetState } from '@shared/sohbet.ts';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { trackOnce } from '@/lib/analytics';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

// The current conversation card; either table deals the next one (MVP_SPEC §5.3). The new card
// reaches both phones through the room's Postgres Changes.
// sohbet_card_opened counts each card once, from the owner's phone (room-level events come from
// one table only), with its theme and nothing of the prompt.
export function SohbetCard({
  roomId,
  state,
  isOwner,
}: {
  roomId: string;
  state: SohbetState | null;
  isOwner: boolean;
}) {
  const now = useNow(500);
  const cardId = state?.cardId;
  const theme = state?.theme;
  useEffect(() => {
    if (isOwner && cardId && theme) {
      trackOnce(`sohbet_card:${roomId}:${cardId}`, 'sohbet_card_opened', { theme });
    }
  }, [isOwner, roomId, cardId, theme]);
  const next = useMutation({ mutationFn: () => gamesApi.sohbetNext(roomId) });
  const waitMs = state ? Date.parse(state.nextAllowedAt) - now : 0;
  const waitS = Math.max(0, Math.ceil(waitMs / 1000));

  return (
    <View className="items-center gap-4">
      {state ? (
        <Card className="self-stretch">
          <View className="items-center gap-3 py-2">
            <Text variant="eyebrow">{tr.games.themes[state.theme]}</Text>
            <Text variant="title" align="center">
              {state.prompt}
            </Text>
          </View>
        </Card>
      ) : null}
      {next.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(next.error)}
        </Text>
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
