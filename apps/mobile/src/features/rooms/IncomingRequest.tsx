import { conceptMode } from '@shared/concepts.ts';
import type { Concept } from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { ProfiledTag } from './ProfiledTag';
import { roomKeys, useIncomingRequests } from './queries';

type Props = { roomId: string; ownerSessionId: string | null; concept: Concept };

// The owner's 60 second window: Kabul / Geç (MVP_SPEC §4.4, screen 4).
export function IncomingRequest({ roomId, ownerSessionId, concept }: Props) {
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
    <Modal transparent animationType="fade" visible>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View className="w-full rounded-2xl bg-white p-6">
          <Text className="text-xl font-bold text-black">{tr.rooms.incomingTitle}</Text>
          <Text className="mt-3 text-base text-neutral-700">
            {tr.rooms.incomingBody(
              request.requester_alias,
              request.requester_headcount,
              tr.concepts[concept],
            )}
          </Text>
          {conceptMode(concept) === 'voice' ? (
            <Text className="mt-2 text-sm text-neutral-600">{tr.voiceNote}</Text>
          ) : null}
          {request.requester_profiled ? (
            <View className="mt-3 flex-row">
              <ProfiledTag />
            </View>
          ) : null}
          <Text className="mt-2 text-sm text-neutral-500">{tr.rooms.secondsLeft(seconds)}</Text>
          {respond.isError ? (
            <Text className="mt-3 text-sm text-red-600">{errorMessage(respond.error)}</Text>
          ) : null}
          <View className="mt-6 gap-3">
            <Button
              testID="join-accept"
              label={tr.rooms.accept}
              onPress={() => respond.mutate({ id: request.id, accept: true })}
              loading={respond.isPending}
            />
            <Button
              variant="secondary"
              label={tr.rooms.decline}
              onPress={() => respond.mutate({ id: request.id, accept: false })}
              disabled={respond.isPending}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
