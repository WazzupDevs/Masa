import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { SpotPicker } from '@/features/checkin/SpotPicker';
import { useVenueSpots } from '@/features/checkin/spots';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { callChangeSpot } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';

// Changing the table's spot without a new position (docs/SPEC_V3.md §4.3). The server refuses it
// while the table is in a room or has a request out.
export default function ChangeSpotScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const table = useActiveTable();
  const spots = useVenueSpots(table.data?.venue_id);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? table.data?.spot_id ?? null;

  const change = useMutation({
    mutationFn: callChangeSpot,
    onSuccess: async () => {
      track('spot_changed', {});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activeTable'] }),
        queryClient.invalidateQueries({ queryKey: roomKeys.lobby(table.data?.venue_id ?? '') }),
      ]);
      router.back();
    },
  });

  if (table.isPending) {
    return (
      <Screen>
        <ActivityIndicator className="mt-16" color={colors.muted} />
      </Screen>
    );
  }
  if (!table.data) return <Redirect href="/explore" />;

  return (
    <Screen>
      <ScreenHeader
        eyebrow={table.data.venue?.name ?? ''}
        eyebrowIcon="location-outline"
        title={tr.venue.changeSpotTitle}
        subtitle={tr.venue.changeSpotHint}
        onBack={() => router.back()}
      />
      <View className="mt-4">
        <SpotPicker
          spots={spots.data ?? []}
          selectedId={selected}
          onSelect={(s) => setChosen(s.id)}
        />
      </View>
      {change.isError ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {errorMessage(change.error)}
        </Text>
      ) : null}
      <View className="mt-auto pt-8">
        <Button
          label={tr.venue.changeSpotSave}
          onPress={() => selected && change.mutate(selected)}
          disabled={!selected || selected === table.data.spot_id}
          loading={change.isPending}
        />
      </View>
    </Screen>
  );
}
