import { PARTICIPATIONS, type Participation } from '@shared/profile.ts';
import { isIntent, requesterStatus } from '@shared/rooms.ts';
import { groupRoomsBySpot } from '@shared/spots.ts';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Choice } from '@/components/Choice';
import { Rise } from '@/components/motion';
import { EmptyState } from '@/components/EmptyState';
import { Sheet } from '@/components/Sheet';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { registerForPush } from '@/features/push/push';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track, trackOnce } from '@/lib/analytics';
import { callChangeSpot, roomsApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON } from '@/theme/tokens';

import { participationHint } from './participation';
import { ProfiledTag } from './ProfiledTag';
import { roomKeys, useLobby, useMyRequest } from './queries';
import { useCreateSolo } from './useCreateSolo';

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
  const profile = useProfile();
  const hasName = !!profile.data?.display_name;
  // The room this table is about to ask for, and its choice for that room (docs/SPEC_V3.md §5.4).
  const [asking, setAsking] = useState<string | null>(null);
  const [participation, setParticipation] = useState<Participation>('anonymous');
  const solo = useCreateSolo();
  const lobby = useLobby(venueId);
  const myRequest = useMyRequest(sessionId, since);
  const now = useNow(1000);

  const request = useMutation({
    mutationFn: ({ roomId, profiled }: { roomId: string; profiled: boolean }) => {
      void registerForPush();
      return roomsApi.requestJoin(roomId, profiled);
    },
    onSuccess: (_data, { profiled }) => {
      track('join_requested', {});
      track('participation_chosen', { mode: profiled ? 'profile' : 'anonymous' });
    },
    onSettled: () => {
      setAsking(null);
      void queryClient.invalidateQueries({ queryKey: roomKeys.myRequest });
    },
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
          snail
          body={tr.rooms.playWithTableHint}
          action={{ label: tr.rooms.playWithTable, onPress: () => solo.mutate() }}
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
                <View className="mt-1 flex-row items-center gap-2">
                  <Ionicons name="location-outline" size={ICON.md} color={colors.text} />
                  <Text variant="heading" accessibilityRole="header" className="flex-1">
                    {group.spotId === null
                      ? tr.rooms.noSpot
                      : group.mine
                        ? tr.rooms.mySpot(group.spotName ?? '')
                        : group.spotName}
                  </Text>
                </View>
              ) : null}
              {group.rooms.map((room, i) => {
                const waitedMin = Math.floor((now - Date.parse(room.waiting_since)) / 60_000);
                const spotId = room.spot_id;
                const intent = isIntent(room.intent) ? room.intent : null;
                return (
                  <Rise key={room.room_id} index={i}>
                    <Card className="gap-3">
                      <View className="flex-row items-center gap-3.5">
                        <Avatar kind="table" alias={room.alias} size="xl" />
                        <View className="flex-1 gap-0.5">
                          <Text variant="heading" numberOfLines={1}>
                            {room.alias}
                          </Text>
                          <Text variant="fine">
                            {`${tr.rooms.people(room.headcount)} · ${tr.rooms.waitingFor(waitedMin)}`}
                          </Text>
                        </View>
                        {intent ? <Tag variant={intent} label={tr.intents[intent]} /> : null}
                      </View>
                      {room.profiled ? (
                        <View className="flex-row">
                          <ProfiledTag />
                        </View>
                      ) : null}
                      {group.mine ? (
                        <Button
                          variant="secondary"
                          label={tr.rooms.requestJoin}
                          onPress={() => {
                            setParticipation('anonymous');
                            setAsking(room.room_id);
                          }}
                          disabled={status === 'pending' || request.isPending}
                        />
                      ) : spotId !== null ? (
                        <Button
                          variant="secondary"
                          testID="spot-here"
                          icon="location-outline"
                          label={tr.rooms.spotHere}
                          onPress={() => moveHere.mutate(spotId)}
                          disabled={status === 'pending' || moveHere.isPending}
                        />
                      ) : (
                        <Text variant="fine">{tr.rooms.otherSpot}</Text>
                      )}
                    </Card>
                  </Rise>
                );
              })}
            </View>
          ))}
        </View>
      )}

      <Sheet
        visible={asking !== null}
        onClose={() => setAsking(null)}
        title={tr.rooms.requestTitle}
        icon="people-outline"
      >
        <Text variant="label">{tr.participation.title}</Text>
        <View accessibilityRole="radiogroup" className="gap-2">
          {PARTICIPATIONS.map((mode) => (
            <Choice
              key={mode}
              testID={`request-${mode}`}
              label={tr.participation[mode]}
              hint={participationHint(mode, hasName)}
              selected={participation === mode}
              disabled={mode === 'profile' && !hasName}
              onPress={() => setParticipation(mode)}
            />
          ))}
        </View>
        <Button
          testID="request-send"
          label={tr.rooms.sendRequest}
          onPress={() =>
            asking && request.mutate({ roomId: asking, profiled: participation === 'profile' })
          }
          loading={request.isPending}
        />
      </Sheet>
    </View>
  );
}
