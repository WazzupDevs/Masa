import { conceptMode } from '@shared/concepts.ts';
import { type Concept, JOIN_REQUEST_TTL_SECONDS } from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Countdown } from '@/components/Countdown';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON } from '@/theme/tokens';

import { ProfiledTag } from './ProfiledTag';
import { roomKeys, useIncomingRequests } from './queries';

type Props = { roomId: string; ownerSessionId: string | null; concept: Concept };

// The owner's 60 second window: Kabul / Geç (MVP_SPEC §4.4, screen 4).
export function IncomingRequest({ roomId, ownerSessionId, concept }: Props) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const requests = useIncomingRequests(roomId, ownerSessionId);
  const now = useNow(1000);
  const request = requests.data?.find((r) => Date.parse(r.expires_at) > now);

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => roomsApi.respond(id, accept),
    onSuccess: (_data, { accept }) => {
      if (accept) track('room_two_tables', {});
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roomKeys.incoming(roomId) });
      void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });
    },
  });

  if (!request) return null;
  const seconds = Math.max(0, Math.ceil((Date.parse(request.expires_at) - now) / 1000));

  return (
    <Sheet visible centered title={tr.rooms.incomingTitle} icon="people-outline">
      <Text variant="bodyStrong" align="center">
        {tr.rooms.incomingBody(
          request.requester_alias,
          request.requester_headcount,
          tr.concepts[concept],
        )}
      </Text>
      {conceptMode(concept) === 'voice' ? (
        <Text variant="fine" align="center">
          {tr.voiceNote}
        </Text>
      ) : null}
      {request.requester_profiled ? (
        <View className="items-center">
          <ProfiledTag />
        </View>
      ) : null}
      <View className="mt-1">
        <Countdown
          secondsLeft={seconds}
          totalSeconds={JOIN_REQUEST_TTL_SECONDS}
          label={tr.rooms.secondsLeft(seconds)}
        />
      </View>
      {respond.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(respond.error)}
        </Text>
      ) : null}
      <View className="mt-1 flex-row gap-2.5">
        <View className="flex-1">
          <Button
            variant="secondary"
            label={tr.rooms.decline}
            onPress={() => respond.mutate({ id: request.id, accept: false })}
            disabled={respond.isPending}
          />
        </View>
        <View className="flex-1">
          <Button
            label={tr.rooms.accept}
            onPress={() => respond.mutate({ id: request.id, accept: true })}
            loading={respond.isPending}
          />
        </View>
      </View>
      <View className="flex-row items-start gap-2">
        <Ionicons name="lock-closed-outline" size={ICON.sm} color={colors.muted} />
        <Text variant="fine" className="flex-1">
          {tr.rooms.declineNote}
        </Text>
      </View>
    </Sheet>
  );
}
