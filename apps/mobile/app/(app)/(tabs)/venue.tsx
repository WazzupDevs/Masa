import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { useVenueSpots } from '@/features/checkin/spots';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { Lobby } from '@/features/rooms/Lobby';
import { useCurrentRoom } from '@/features/rooms/queries';
import { useCreateSolo } from '@/features/rooms/useCreateSolo';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { sessionDurationMinutes } from '@shared/analytics.ts';
import { ALIAS_REROLLS_PER_CHECKIN } from '@shared/rooms.ts';

import { track, trackOnce } from '@/lib/analytics';
import { callLeave, callRerollAlias } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, TOUCH } from '@/theme/tokens';

function endSession(tableId: string, startedAt: string) {
  trackOnce(`session_ended:${tableId}`, 'session_ended', {
    duration_min: sessionDurationMinutes(startedAt, Date.now()),
  });
}

// The active table's venue: lobby, rooms, leaving (docs/SPEC_V2.md §2). Without an active table
// it sends the user to Keşfet; an open room of the table opens directly.
export default function VenueScreen() {
  const { colors, shape } = useTheme();
  const queryClient = useQueryClient();
  const table = useActiveTable();
  const currentRoom = useCurrentRoom(table.data?.id);
  const spots = useVenueSpots(table.data?.venue_id);
  const solo = useCreateSolo();
  const reroll = useMutation({
    mutationFn: callRerollAlias,
    onSuccess: () => {
      track('alias_rerolled', {});
      return queryClient.invalidateQueries({ queryKey: ['activeTable'] });
    },
  });
  const venueHasSpots = (spots.data ?? []).length > 0;
  const now = useNow(30_000);

  const leave = useMutation({
    mutationFn: callLeave,
    onSuccess: () => {
      if (table.data) endSession(table.data.id, table.data.created_at);
      return queryClient.invalidateQueries();
    },
  });

  const expiresAt = table.data ? Date.parse(table.data.expires_at) : null;
  const expired = expiresAt !== null && expiresAt <= now;

  const tableId = table.data?.id;
  const tableStartedAt = table.data?.created_at;
  useEffect(() => {
    if (!expired) return;
    if (tableId && tableStartedAt) endSession(tableId, tableStartedAt);
    void queryClient.invalidateQueries({ queryKey: ['activeTable'] });
  }, [expired, queryClient, tableId, tableStartedAt]);

  if (table.isPending) {
    return (
      <Screen edges={['top']}>
        <ActivityIndicator className="mt-16" color={colors.muted} />
      </Screen>
    );
  }

  if (!table.data || expired || expiresAt === null) {
    return <Redirect href="/explore" />;
  }

  if (currentRoom.data) {
    return <Redirect href={{ pathname: '/room/[id]', params: { id: currentRoom.data.id } }} />;
  }

  const minutesLeft = Math.max(0, Math.ceil((expiresAt - now) / 60_000));

  function confirmLeave() {
    Alert.alert(tr.venue.leaveConfirmTitle, tr.venue.leaveConfirmBody, [
      { text: tr.common.cancel, style: 'cancel' },
      { text: tr.venue.leaveConfirm, style: 'destructive', onPress: () => leave.mutate() },
    ]);
  }

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        eyebrow={tr.venue.here}
        eyebrowIcon="location-outline"
        title={table.data.venue?.name ?? ''}
      />
      <Card tone="feature" className="mt-3">
        <View className="flex-row items-center gap-3.5">
          <Avatar kind="table" alias={table.data.alias} size="xl" />
          <View className="flex-1 gap-1">
            <Text variant="overline" tone="muted">
              {tr.venue.yourTable}
            </Text>
            <Text variant="alias" testID="table-alias" numberOfLines={1} adjustsFontSizeToFit>
              {table.data.alias}
            </Text>
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Tag label={tr.venue.people(table.data.headcount)} />
              <Tag
                icon="time-outline"
                label={tr.venue.remaining(Math.floor(minutesLeft / 60), minutesLeft % 60)}
              />
            </View>
          </View>
        </View>
        <View
          className="my-2.5"
          style={{ height: shape.stroke.hairline, backgroundColor: colors.divider }}
        />
        {venueHasSpots ? (
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1 flex-row items-center gap-2">
              <Ionicons name="location-outline" size={ICON.md} color={colors.text} />
              <Text variant="bodyStrong" className="flex-1">
                {table.data.spot?.name ? tr.venue.spot(table.data.spot.name) : tr.venue.noSpot}
              </Text>
            </View>
            <Button
              variant="ghost"
              testID="change-spot"
              label={table.data.spot_id ? tr.venue.changeSpot : tr.venue.chooseSpot}
              onPress={() => router.push('/spot')}
            />
          </View>
        ) : null}
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="fine" className="flex-1">
            {tr.venue.rerollsLeft(ALIAS_REROLLS_PER_CHECKIN - table.data.alias_rerolls)}
          </Text>
          <Button
            variant="ghost"
            testID="reroll-alias"
            label={tr.venue.rerollAlias}
            onPress={() => reroll.mutate()}
            disabled={table.data.alias_rerolls >= ALIAS_REROLLS_PER_CHECKIN}
            loading={reroll.isPending}
          />
        </View>
        {reroll.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(reroll.error)}
          </Text>
        ) : null}
      </Card>
      {/* Side by side: the venue chat row stays above the floating tab bar on small phones. */}
      <View className="mt-5 flex-row gap-3">
        <View className="flex-1">
          <Button tight label={tr.rooms.create} onPress={() => router.push('/room/new')} />
        </View>
        <View className="flex-1">
          <Button
            variant="secondary"
            tight
            testID="play-with-table"
            label={tr.rooms.playWithTable}
            onPress={() => solo.mutate()}
            loading={solo.isPending}
          />
        </View>
      </View>
      {solo.isError ? (
        <Text variant="fine" tone="danger" className="mt-2">
          {errorMessage(solo.error)}
        </Text>
      ) : null}
      <View className="mt-4">
        <ListRow
          card
          testID="venue-chat-open"
          title={tr.venueChat.open}
          meta={tr.venueChat.title(table.data.venue?.name ?? '')}
          onPress={() => router.push('/venue-chat')}
          leading={
            <View
              className="items-center justify-center"
              style={{
                width: TOUCH.button,
                height: TOUCH.button,
                borderRadius: shape.radius.pill,
                backgroundColor: colors.signal,
              }}
            >
              <Ionicons name="chatbubbles-outline" size={ICON.lg} color={colors.onSignal} />
            </View>
          }
        />
      </View>

      <Lobby
        venueId={table.data.venue_id}
        sessionId={table.data.id}
        since={table.data.created_at}
        mySpotId={table.data.spot_id}
        venueHasSpots={venueHasSpots}
      />

      <View className="mt-auto gap-3 pt-8">
        {leave.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(leave.error)}
          </Text>
        ) : null}
        <Button
          variant="dangerText"
          label={tr.venue.leave}
          onPress={confirmLeave}
          loading={leave.isPending}
        />
      </View>
    </Screen>
  );
}
