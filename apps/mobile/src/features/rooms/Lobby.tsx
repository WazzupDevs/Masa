import { conceptMode } from '@shared/concepts.ts';
import { type Concept, requesterStatus } from '@shared/rooms.ts';
import { groupRoomsBySpot } from '@shared/spots.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Text } from '@/components/Text';
import { registerForPush } from '@/features/push/push';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track, trackOnce } from '@/lib/analytics';
import { callChangeSpot, roomsApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON } from '@/theme/tokens';

import { ProfiledTag } from './ProfiledTag';
import { roomKeys, useLobby, useMyRequest } from './queries';

type Props = {
  venueId: string;
  sessionId: string;
  since: string;
  // The table's spot, and whether the venue has spots at all (docs/SPEC_V3.md §4.3).
  mySpotId: string | null;
  venueHasSpots: boolean;
};

// Open rooms at the venue and the table's own request. When nothing is open the lobby is hidden
// and "Masanla oyna" shows instead (MVP_SPEC §4.3). At a venue with spots the rooms are grouped by
// spot, the table's own first; a room at another spot offers "Bu noktadayım" instead of a request.
export function Lobby({ venueId, sessionId, since, mySpotId, venueHasSpots }: Props) {
  const { colors } = useTheme();
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
  const moveHere = useMutation({
    mutationFn: callChangeSpot,
    onSuccess: () => {
      track('spot_changed', {});
      return queryClient.invalidateQueries({ queryKey: ['activeTable'] });
    },
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
    <View className="mt-6">
      {status === 'pending' ? (
        <Card tone="note" className="mb-3">
          <Text accessibilityLiveRegion="polite">{tr.rooms.requestPending(secondsLeft)}</Text>
        </Card>
      ) : null}
      {recentlyUnavailable ? (
        <Card tone="note" className="mb-3">
          <Text accessibilityLiveRegion="polite">{tr.rooms.requestUnavailable}</Text>
        </Card>
      ) : null}
      {request.isError || moveHere.isError ? (
        <Text variant="fine" tone="danger" className="mb-3">
          {errorMessage(request.error ?? moveHere.error)}
        </Text>
      ) : null}

      {rooms.length === 0 ? (
        <EmptyState
          icon="dice-outline"
          body={tr.rooms.playWithTableHint}
          action={{
            label: tr.rooms.playWithTable,
            onPress: () =>
              router.push({ pathname: '/room/new', params: { visibility: 'private' } }),
          }}
        />
      ) : (
        <View className="gap-3">
          <View className="mb-1 flex-row items-center justify-between">
            <Text variant="heading" accessibilityRole="header">
              {tr.rooms.lobbyTitle}
            </Text>
            <Text variant="fine">{tr.rooms.roomCount(rooms.length)}</Text>
          </View>
          {groupRoomsBySpot(rooms, mySpotId).map((group) => (
            <View key={group.spotId ?? 'none'} className="gap-3">
              {venueHasSpots ? (
                <Text variant="label" accessibilityRole="header" className="mt-2">
                  {group.spotId === null
                    ? tr.rooms.noSpot
                    : group.mine
                      ? tr.rooms.mySpot(group.spotName ?? '')
                      : group.spotName}
                </Text>
              ) : null}
              {group.rooms.map((room) => {
                const waitedMin = Math.floor((now - Date.parse(room.waiting_since)) / 60_000);
                const voice = conceptMode(room.concept as Concept) === 'voice';
                const spotId = room.spot_id;
                return (
                  <Card key={room.room_id}>
                    <View className="flex-row items-center justify-between gap-2">
                      <View className="flex-1 flex-row flex-wrap items-center gap-2">
                        <Text variant="bodyStrong">{room.alias}</Text>
                        {room.profiled ? <ProfiledTag /> : null}
                      </View>
                      <Text variant="fine">{tr.rooms.waitingFor(waitedMin)}</Text>
                    </View>
                    <View className="mb-1.5 mt-1 flex-row items-center gap-1">
                      <Text variant="subtitle">
                        {tr.rooms.people(room.headcount)} ·{' '}
                        {tr.conceptWithMode(room.concept as Concept)}
                      </Text>
                      {voice ? (
                        <Ionicons name="mic-outline" size={ICON.sm} color={colors.muted} />
                      ) : null}
                    </View>
                    {group.mine ? (
                      <Button
                        variant="secondary"
                        label={tr.rooms.requestJoin}
                        onPress={() => request.mutate(room.room_id)}
                        disabled={status === 'pending' || request.isPending}
                      />
                    ) : spotId !== null ? (
                      <Button
                        variant="secondary"
                        testID="spot-here"
                        label={tr.rooms.spotHere}
                        onPress={() => moveHere.mutate(spotId)}
                        disabled={status === 'pending' || moveHere.isPending}
                      />
                    ) : (
                      <Text variant="fine">{tr.rooms.otherSpot}</Text>
                    )}
                  </Card>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
