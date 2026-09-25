import { type Concept, requesterStatus } from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { registerForPush } from '@/features/push/push';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track, trackOnce } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { ProfiledTag } from './ProfiledTag';
import { roomKeys, useLobby, useMyRequest } from './queries';

type Props = { venueId: string; sessionId: string; since: string };

// Open rooms at the venue and the table's own request. When nothing is open the lobby is hidden
// and "Masanla oyna" shows instead (MVP_SPEC §4.3).
export function Lobby({ venueId, sessionId, since }: Props) {
  const queryClient = useQueryClient();
  const lobby = useLobby(venueId);
  const myRequest = useMyRequest(sessionId, since);
  const now = useNow(1000);

  const request = useMutation({
    mutationFn: (roomId: string) => {
      void registerForPush();
      return roomsApi.requestJoin(roomId);
    },
    onSuccess: () => track('join_requested', {}),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: roomKeys.myRequest }),
  });

  const mine = myRequest.data;
  const status = mine ? requesterStatus(mine.status, mine.expiresAt, now) : null;
  const viewStale = mine?.status === 'pending' && status === 'unavailable';
  const { refetch } = myRequest;
  // Refetch once the local clock passes expires_at, so the view and the UI agree.
  useEffect(() => {
    if (viewStale) void refetch();
  }, [viewStale, refetch]);
  const requestId = mine?.id;
  useEffect(() => {
    if (requestId && status === 'unavailable') {
      trackOnce(`join_unavailable:${requestId}`, 'join_unavailable', {});
    }
  }, [requestId, status]);
  const secondsLeft = mine ? Math.max(0, Math.ceil((Date.parse(mine.expiresAt) - now) / 1000)) : 0;
  const recentlyUnavailable =
    mine && status === 'unavailable' && now - Date.parse(mine.expiresAt) < 15_000;

  const rooms = lobby.data ?? [];

  return (
    <View className="mt-8">
      {status === 'pending' ? (
        <Text className="mb-4 rounded-xl bg-neutral-100 p-4 text-base text-neutral-700">
          {tr.rooms.requestPending(secondsLeft)}
        </Text>
      ) : null}
      {recentlyUnavailable ? (
        <Text className="mb-4 rounded-xl bg-neutral-100 p-4 text-base text-neutral-700">
          {tr.rooms.requestUnavailable}
        </Text>
      ) : null}
      {request.isError ? (
        <Text className="mb-4 text-sm text-red-600">{errorMessage(request.error)}</Text>
      ) : null}

      {rooms.length === 0 ? (
        <View className="gap-3">
          <Text className="text-base text-neutral-600">{tr.rooms.playWithTableHint}</Text>
          <Button
            variant="secondary"
            label={tr.rooms.playWithTable}
            onPress={() =>
              router.push({ pathname: '/room/new', params: { visibility: 'private' } })
            }
          />
        </View>
      ) : (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-neutral-500">{tr.rooms.lobbyTitle}</Text>
          {rooms.map((room) => {
            const waitedMin = Math.floor((now - Date.parse(room.waiting_since)) / 60_000);
            return (
              <View key={room.room_id} className="rounded-xl border border-neutral-200 p-4">
                <View className="flex-row items-center gap-2">
                  <Text className="text-base font-semibold text-black">{room.alias}</Text>
                  {room.profiled ? <ProfiledTag /> : null}
                </View>
                <Text className="text-sm text-neutral-500">
                  {tr.rooms.people(room.headcount)} · {tr.conceptWithMode(room.concept as Concept)}{' '}
                  · {tr.rooms.waitingFor(waitedMin)}
                </Text>
                <View className="mt-3">
                  <Button
                    label={tr.rooms.requestJoin}
                    onPress={() => request.mutate(room.room_id)}
                    disabled={status === 'pending' || request.isPending}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
