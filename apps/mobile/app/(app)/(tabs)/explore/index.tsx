import { exploreLayout } from '@shared/explore.ts';
import { hasActiveTable } from '@shared/navigation.ts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTabBarSpace } from '@/components/TabBar';
import { Segmented } from '@/components/Segmented';
import { Text } from '@/components/Text';
import { useCheckinDraft } from '@/features/checkin/draft';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { ExploreMap } from '@/features/explore/ExploreMap';
import { type ExploreVenue, useExploreVenues } from '@/features/explore/useExploreVenues';
import { BucketBadge, EventTag } from '@/features/explore/VenueTags';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

type View_ = 'list' | 'map';

const BUCKET_ORDER = { buzzing: 0, lively: 1, calm: 2 } as const;

// Keşfet (docs/SPEC_V2.md §4): every venue, livelier ones first, as a list or on a map. The venue
// is chosen by hand; check-in then verifies the position. With one active venue (the campus pilot)
// it is a single venue card with all its events and no list/map switch (docs/SPEC_V3.md §4.4).
export default function ExploreScreen() {
  const { colors, shape } = useTheme();
  const table = useActiveTable();
  const now = useNow(30_000);
  const venues = useExploreVenues();
  const [view, setView] = useState<View_>('list');
  // The map lies under the header; its opening camera keeps the venues below it.
  const [headerHeight, setHeaderHeight] = useState(0);
  // The floating tab bar covers the bottom of the map and the list.
  const barSpace = useTabBarSpace();

  const layout = venues.isSuccess ? exploreLayout(venues.data.length) : 'list';

  useEffect(() => {
    if (layout === 'list') track('explore_viewed', { view });
  }, [layout, view]);

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
      <View style={{ flex: 1 }}>
        {venues.isSuccess && layout === 'list' && view === 'map' && headerHeight > 0 ? (
          <View style={StyleSheet.absoluteFill}>
            <ExploreMap venues={sorted} headerHeight={headerHeight} tabBarHeight={barSpace} />
          </View>
        ) : null}
        <View
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
          style={{ paddingHorizontal: shape.screenPadding, backgroundColor: colors.canvas }}
          className="pb-2.5 pt-3"
        >
          <ScreenHeader
            title={tr.tabs.explore}
            trailing={
              layout === 'single' ? undefined : (
                <Segmented
                  accessibilityLabel={tr.explore.viewSwitch}
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'list', label: tr.explore.views.list, icon: 'list' },
                    { value: 'map', label: tr.explore.views.map, icon: 'map-outline' },
                  ]}
                />
              )
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

        {venues.isSuccess && layout === 'list' && view === 'list' ? (
          <VenueList venues={sorted} bottomSpace={barSpace} />
        ) : null}
        {venues.isSuccess && layout === 'single' && sorted[0] ? (
          <SingleVenue venue={sorted[0]} bottomSpace={barSpace} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// The mockup's sheet: a surface with rounded top corners, the count, and venue rows.
function VenueList({
  venues,
  bottomSpace,
}: {
  venues: readonly ExploreVenue[];
  bottomSpace: number;
}) {
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
      <ScrollView
        contentContainerClassName="px-4 pt-3"
        contentContainerStyle={{ paddingBottom: bottomSpace }}
      >
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

// The pilot's Keşfet: the one venue, its bucket, all its events within the week and check-in, then
// "Yeni mekanlar yakında". A second active venue brings the list and the map back (content only).
function SingleVenue({ venue, bottomSpace }: { venue: ExploreVenue; bottomSpace: number }) {
  const { shape } = useTheme();
  const setVenue = useCheckinDraft((s) => s.setVenue);
  return (
    <ScrollView
      // The floating tab bar covers the bottom: the card and the note end above it.
      contentContainerStyle={{
        paddingHorizontal: shape.screenPadding,
        paddingBottom: SPACING[8] + bottomSpace,
      }}
      contentContainerClassName="gap-4 pt-2"
    >
      <Card>
        <Text variant="heading" accessibilityRole="header">
          {venue.name}
        </Text>
        <Text variant="fine" className="mt-0.5">
          {venue.district}
        </Text>
        <View className="mt-3 flex-row flex-wrap gap-1.5">
          <BucketBadge bucket={venue.bucket} />
        </View>
        <View className="mt-4">
          <Button
            label={tr.explore.checkInHere}
            icon="location-outline"
            onPress={() => {
              setVenue({
                id: venue.id,
                name: venue.name,
                lat: venue.lat,
                lng: venue.lng,
                boundary: venue.boundary,
              });
              router.push('/checkin');
            }}
          />
        </View>
      </Card>
      <View className="gap-2">
        <Text variant="label" accessibilityRole="header">
          {tr.explore.eventsTitle}
        </Text>
        {venue.events.length === 0 ? (
          <Text variant="fine">{tr.explore.noEvents}</Text>
        ) : (
          <View className="flex-row flex-wrap gap-1.5">
            {venue.events.map((event) => (
              <EventTag key={`${event.startsAt}-${event.title}`} event={event} />
            ))}
          </View>
        )}
      </View>
      <Card tone="note">
        <Text variant="fine">{tr.explore.comingSoon}</Text>
      </Card>
    </ScrollView>
  );
}
