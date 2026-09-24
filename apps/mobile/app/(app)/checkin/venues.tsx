import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useCheckinDraft } from '@/features/checkin/draft';
import { useNearbyVenues } from '@/features/checkin/useNearbyVenues';
import { tr } from '@/i18n/tr';

export default function VenuesScreen() {
  const position = useCheckinDraft((s) => s.position);
  const setVenue = useCheckinDraft((s) => s.setVenue);
  const venues = useNearbyVenues(position);

  if (!position) return <Redirect href="/checkin" />;

  return (
    <Screen>
      <Text className="text-3xl font-bold text-black">{tr.checkin.venuesTitle}</Text>
      {venues.isPending ? <ActivityIndicator className="mt-8" /> : null}
      {venues.isError ? (
        <View className="mt-6 gap-3">
          <Text className="text-sm text-red-600">{tr.common.genericError}</Text>
          <Button
            variant="secondary"
            label={tr.checkin.retry}
            onPress={() => void venues.refetch()}
          />
        </View>
      ) : null}
      {venues.isSuccess && venues.data.length === 0 ? (
        <View className="mt-6 gap-3">
          <Text className="text-base text-neutral-600">{tr.checkin.noVenues}</Text>
          <Button variant="secondary" label={tr.checkin.retry} onPress={() => router.back()} />
        </View>
      ) : null}
      <View className="mt-6 gap-2">
        {venues.data?.map((v) => (
          <Pressable
            key={v.id}
            accessibilityRole="button"
            onPress={() => {
              setVenue({ id: v.id, name: v.name });
              router.push('/checkin/headcount');
            }}
            className="flex-row items-center justify-between rounded-xl border border-neutral-200 px-4 py-4"
          >
            <View className="flex-1 pr-3">
              <Text className="text-base font-semibold text-black">{v.name}</Text>
              <Text className="text-sm text-neutral-500">{v.district}</Text>
            </View>
            <Text className="text-sm text-neutral-500">
              {tr.checkin.distance(Math.round(v.distance_m))}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text className="mt-auto pt-8 text-center text-xs text-neutral-400">
        {tr.checkin.osmAttribution}
      </Text>
    </Screen>
  );
}
