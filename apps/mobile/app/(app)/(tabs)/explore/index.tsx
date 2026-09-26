import { hasActiveTable } from '@shared/navigation.ts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Segmented } from '@/components/Segmented';
import { Text } from '@/components/Text';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { ExploreMap } from '@/features/explore/ExploreMap';
import { type ExploreVenue, useExploreVenues } from '@/features/explore/useExploreVenues';
import { BucketBadge, EventTag } from '@/features/explore/VenueTags';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';

type View_ = 'list' | 'map';

const BUCKET_ORDER = { buzzing: 0, lively: 1, calm: 2 } as const;

// Keşfet (docs/SPEC_V2.md §4): every venue, livelier ones first, as a list or on a map. The venue
// is chosen by hand; check-in then verifies the position.
export default function ExploreScreen() {
  const { colors, shape } = useTheme();
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingHorizontal: shape.screenPadding }} className="pb-2.5 pt-3">
        <ScreenHeader
          title={tr.tabs.explore}
          trailing={
            <Segmented
              accessibilityLabel={tr.explore.viewSwitch}
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: tr.explore.views.list, icon: 'list' },
                { value: 'map', label: tr.explore.views.map, icon: 'map-outline' },
              ]}
            />
          }
        />
        {active ? (
          <View className="mt-2">
            <Button label={tr.explore.backToVenue} onPress={() => router.navigate('/venue')} />
          </View>
        ) : null}
      </View>

      {venues.isPending ? <ActivityIndicator className="mt-8" color={colors.muted} /> : null}
      {venues.isError ? (
        <View style={{ paddingHorizontal: shape.screenPadding }}>
          <EmptyState
            icon="cloud-offline-outline"
            body={tr.common.genericError}
            action={{ label: tr.checkin.retry, onPress: () => void venues.refetch() }}
          />
        </View>
      ) : null}

      {venues.isSuccess && view === 'map' ? <ExploreMap venues={sorted} /> : null}
      {venues.isSuccess && view === 'list' ? <VenueList venues={sorted} /> : null}
    </SafeAreaView>
  );
}

// The mockup's sheet: a surface with rounded top corners, the count, and venue rows.
function VenueList({ venues }: { venues: readonly ExploreVenue[] }) {
  const { colors, shape } = useTheme();
  return (
    <View
      className="flex-1 overflow-hidden"
      style={{
        backgroundColor: colors.surface,
        borderTopLeftRadius: shape.radius.lg,
        borderTopRightRadius: shape.radius.lg,
        borderWidth: shape.stroke.card > 1 ? shape.stroke.card : 0,
        borderBottomWidth: 0,
        borderColor: colors.border,
      }}
    >
      <ScrollView contentContainerClassName="px-4 pb-8 pt-3">
        <View className="flex-row items-center justify-between px-1 pb-1">
          <Text variant="label">{tr.explore.count(venues.length)}</Text>
          <Text variant="fine">{tr.explore.locationHidden}</Text>
        </View>
        {venues.length === 0 ? <EmptyState icon="cafe-outline" body={tr.explore.empty} /> : null}
        {venues.map((v) => (
          <ListRow
            key={v.id}
            title={v.name}
            meta={v.district}
            onPress={() =>
              router.push({ pathname: '/explore/[venueId]', params: { venueId: v.id } })
            }
            below={
              <View className="mt-1 flex-row flex-wrap gap-1.5">
                <BucketBadge bucket={v.bucket} />
                {v.event ? <EventTag event={v.event} /> : null}
              </View>
            }
          />
        ))}
        <Text variant="fine" align="center" className="pt-4">
          {tr.checkin.osmAttribution}
        </Text>
      </ScrollView>
    </View>
  );
}
