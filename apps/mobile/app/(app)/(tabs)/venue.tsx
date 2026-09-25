import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { Lobby } from '@/features/rooms/Lobby';
import { useCurrentRoom } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { sessionDurationMinutes } from '@shared/analytics.ts';

import { trackOnce } from '@/lib/analytics';
import { callLeave } from '@/lib/api';
import { useNow } from '@/lib/useNow';

function endSession(tableId: string, startedAt: string) {
  trackOnce(`session_ended:${tableId}`, 'session_ended', {
    duration_min: sessionDurationMinutes(startedAt, Date.now()),
  });
}

// The active table's venue: lobby, rooms, leaving (docs/SPEC_V2.md §2). Without an active table
// it sends the user to Keşfet; an open room of the table opens directly.
export default function VenueScreen() {
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
      <Screen>
        <ActivityIndicator className="mt-16" />
      </Screen>
    );
  }

  if (!table.data || expired || expiresAt === null) {
    return <Redirect href="/" />;
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
    <Screen>
      <Text className="text-3xl font-bold text-black">{table.data.venue?.name}</Text>
      <Text className="mt-2 text-sm text-neutral-500">{tr.venue.yourTable}</Text>
      <Text className="text-2xl font-semibold text-black">{table.data.alias}</Text>
      <Text className="mt-1 text-base text-neutral-600">
        {tr.venue.people(table.data.headcount)} ·{' '}
        {tr.venue.remaining(Math.floor(minutesLeft / 60), minutesLeft % 60)}
      </Text>

      <View className="mt-6">
        <Button label={tr.rooms.create} onPress={() => router.push('/room/new')} />
      </View>

      <Lobby
        venueId={table.data.venue_id}
        sessionId={table.data.id}
        since={table.data.created_at}
      />

      <View className="mt-auto gap-3 pt-8">
        {leave.isError ? (
          <Text className="text-sm text-red-600">{errorMessage(leave.error)}</Text>
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
