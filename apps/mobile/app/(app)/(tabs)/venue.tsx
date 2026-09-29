import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { Lobby } from '@/features/rooms/Lobby';
import { useCurrentRoom } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { sessionDurationMinutes } from '@shared/analytics.ts';

import { trackOnce } from '@/lib/analytics';
import { callLeave } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON } from '@/theme/tokens';

function endSession(tableId: string, startedAt: string) {
  trackOnce(`session_ended:${tableId}`, 'session_ended', {
    duration_min: sessionDurationMinutes(startedAt, Date.now()),
  });
}

// The active table's venue: lobby, rooms, leaving (docs/SPEC_V2.md §2). Without an active table
// it sends the user to Keşfet; an open room of the table opens directly.
export default function VenueScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const table = useActiveTable();
  const currentRoom = useCurrentRoom(table.data?.id);
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
      <Card className="mt-3">
        <Text variant="label">{tr.venue.yourTable}</Text>
        <Text variant="alias" className="mb-2 mt-0.5">
          {table.data.alias}
        </Text>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Tag label={tr.venue.people(table.data.headcount)} />
          <View className="flex-row items-center gap-1">
            <Ionicons name="time-outline" size={ICON.sm} color={colors.muted} />
            <Text variant="fine">
              {tr.venue.remaining(Math.floor(minutesLeft / 60), minutesLeft % 60)}
            </Text>
          </View>
        </View>
        <View className="mt-3">
          <Button label={tr.rooms.create} onPress={() => router.push('/room/new')} />
        </View>
      </Card>

      <Lobby
        venueId={table.data.venue_id}
        sessionId={table.data.id}
        since={table.data.created_at}
      />

      <View className="mt-auto gap-3 pt-8">
        {leave.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(leave.error)}
          </Text>
        ) : null}
        <Button
          variant="secondary"
          label={tr.venue.leave}
          onPress={confirmLeave}
          loading={leave.isPending}
        />
      </View>
    </Screen>
  );
}
