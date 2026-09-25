import { hasActiveTable } from '@shared/navigation.ts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { ExploreMap } from '@/features/explore/ExploreMap';
import { type ExploreVenue, useExploreVenues } from '@/features/explore/useExploreVenues';
import { BucketBadge, EventTag } from '@/features/explore/VenueTags';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { useNow } from '@/lib/useNow';

type View_ = 'list' | 'map';

const BUCKET_ORDER = { buzzing: 0, lively: 1, calm: 2 } as const;

// Keşfet (docs/SPEC_V2.md §4): every venue, livelier ones first, as a list or on a map. The venue
// is chosen by hand; check-in then verifies the position.
export default function ExploreScreen() {
  const table = useActiveTable();
  const now = useNow(30_000);
  const venues = useExploreVenues();
  const [view, setView] = useState<View_>('list');

  useEffect(() => {
    track('explore_viewed', { view });
  }, [view]);

  const sorted = useMemo(
    () =>
      [...(venues.data ?? [])].sort(
        (a, b) =>
          BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || a.name.localeCompare(b.name, 'tr'),
      ),
    [venues.data],
  );
  const active = hasActiveTable(table.data, now);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="flex-row items-center justify-between px-6 pb-3 pt-4">
        <Text className="text-3xl font-bold text-black">{tr.tabs.explore}</Text>
        <View className="flex-row rounded-full bg-neutral-100 p-1">
          {(['list', 'map'] as const).map((v) => (
            <Pressable
              key={v}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === v }}
              onPress={() => setView(v)}
              className={`rounded-full px-4 py-1.5 ${view === v ? 'bg-black' : ''}`}
            >
              <Text className={`text-sm ${view === v ? 'text-white' : 'text-black'}`}>
                {tr.explore.views[v]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {active ? (
        <View className="px-6 pb-3">
          <Button label={tr.explore.backToVenue} onPress={() => router.navigate('/venue')} />
        </View>
      ) : null}

      {venues.isPending ? <ActivityIndicator className="mt-8" /> : null}
      {venues.isError ? (
        <View className="gap-3 px-6">
          <Text className="text-sm text-red-600">{tr.common.genericError}</Text>
          <Button
            variant="secondary"
            label={tr.checkin.retry}
            onPress={() => void venues.refetch()}
          />
        </View>
      ) : null}

      {venues.isSuccess && view === 'map' ? <ExploreMap venues={sorted} /> : null}
      {venues.isSuccess && view === 'list' ? <VenueList venues={sorted} /> : null}
    </SafeAreaView>
  );
}

function VenueList({ venues }: { venues: readonly ExploreVenue[] }) {
  return (
    <ScrollView contentContainerClassName="gap-2 px-6 pb-8">
      {venues.length === 0 ? (
        <Text className="text-base text-neutral-600">{tr.explore.empty}</Text>
      ) : null}
      {venues.map((v) => (
        <Pressable
          key={v.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/explore/[venueId]', params: { venueId: v.id } })}
          className="gap-1.5 rounded-xl border border-neutral-200 px-4 py-3"
        >
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 pr-3 text-base font-semibold text-black">{v.name}</Text>
            <BucketBadge bucket={v.bucket} />
          </View>
          <Text className="text-sm text-neutral-500">{v.district}</Text>
          {v.event ? <EventTag event={v.event} /> : null}
        </Pressable>
      ))}
      <Text className="pt-4 text-center text-xs text-neutral-400">{tr.checkin.osmAttribution}</Text>
    </ScrollView>
  );
}
