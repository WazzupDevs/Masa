import { Ionicons } from '@expo/vector-icons';
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
import { Rise } from '@/components/motion';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTabBarOverMap, useTabBarSpace } from '@/components/TabBar';
import { Segmented } from '@/components/Segmented';
import { Snail } from '@/components/Snail';
import { Text } from '@/components/Text';
import { useCheckinDraft } from '@/features/checkin/draft';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { ExploreMap } from '@/features/explore/ExploreMap';
import { type ExploreVenue, useExploreVenues } from '@/features/explore/useExploreVenues';
import { BucketBadge, EventRow, EventTag, VenueTile } from '@/features/explore/VenueTags';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

type View_ = 'list' | 'map';

const BUCKET_ORDER = { buzzing: 0, lively: 1, calm: 2 } as const;
// The single venue's colour block (canvas: Keşfet · tek mekan).
const HERO_HEIGHT = SPACING[16] * 2 + SPACING[8];
const HERO_SNAIL = SPACING[16] + SPACING[10];

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
  const showMap = venues.isSuccess && layout === 'list' && view === 'map';
  // The venue card and the tab bar sit right on the map: no fade band over it.
  useTabBarOverMap(showMap);

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
        {showMap && headerHeight > 0 ? (
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

// The venues as cards on the canvas: a colour tile in the venue's bucket, the name and district,
// the bucket chip; an event shows under the name.
function VenueList({
  venues,
  bottomSpace,
}: {
  venues: readonly ExploreVenue[];
  bottomSpace: number;
}) {
  const { shape } = useTheme();
  return (
    <ScrollView
      contentContainerClassName="gap-3 pt-1"
      contentContainerStyle={{
        paddingHorizontal: shape.screenPadding,
        paddingBottom: SPACING[8] + bottomSpace,
      }}
    >
      <View className="flex-row items-center justify-between px-1">
        <Text variant="label">{tr.explore.count(venues.length)}</Text>
        <Text variant="fine">{tr.explore.locationHidden}</Text>
      </View>
      {venues.length === 0 ? <EmptyState icon="cafe-outline" body={tr.explore.empty} /> : null}
      {venues.map((v, i) => (
        <Rise key={v.id} index={i}>
          <ListRow
            card
            title={v.name}
            meta={v.district}
            onPress={() =>
              router.push({ pathname: '/explore/[venueId]', params: { venueId: v.id } })
            }
            leading={<VenueTile bucket={v.bucket} />}
            below={
              v.event ? (
                <View className="mt-1 flex-row">
                  <EventTag event={v.event} />
                </View>
              ) : null
            }
            trailing={<BucketBadge bucket={v.bucket} />}
          />
        </Rise>
      ))}
      <Text variant="fine" align="center" className="pt-2">
        {tr.checkin.osmAttribution}
      </Text>
    </ScrollView>
  );
}

// The pilot's Keşfet: the one venue as the featured card (a colour block with the snail, the name,
// check-in), all its events within the week, then "Yeni mekanlar yakında". A second active venue
// brings the list and the map back (content only).
function SingleVenue({ venue, bottomSpace }: { venue: ExploreVenue; bottomSpace: number }) {
  const { colors, shape } = useTheme();
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
      <Rise>
        <Card tone="feature" flush>
          <View
            style={{ height: HERO_HEIGHT, backgroundColor: colors.violet }}
            className="flex-row items-end justify-between px-4 pb-3 pt-4"
          >
            <View className="self-start">
              <BucketBadge bucket={venue.bucket} />
            </View>
            <Snail variant="ink" height={HERO_SNAIL} />
          </View>
          <View className="gap-4 p-4">
            <View className="gap-1">
              <Text variant="title" accessibilityRole="header" numberOfLines={2}>
                {venue.name}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="location-outline" size={ICON.md} color={colors.muted} />
                <Text variant="fine">{venue.district}</Text>
              </View>
            </View>
            <Button
              size="lg"
              label={tr.explore.checkInHere}
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
      </Rise>
      <Rise index={1}>
        <View className="gap-3">
          <Text variant="heading" accessibilityRole="header">
            {tr.explore.eventsTitle}
          </Text>
          {venue.events.length === 0 ? (
            <Card>
              <View className="flex-row items-center gap-3">
                <View
                  className="items-center justify-center"
                  style={{
                    width: TOUCH.button,
                    height: TOUCH.button,
                    borderRadius: shape.radius.pill,
                    backgroundColor: colors.surface2,
                  }}
                >
                  <Ionicons name="calendar-outline" size={ICON.lg} color={colors.text} />
                </View>
                <Text tone="muted" className="flex-1">
                  {tr.explore.noEvents}
                </Text>
              </View>
            </Card>
          ) : (
            venue.events.map((event) => (
              <EventRow key={`${event.startsAt}-${event.title}`} event={event} />
            ))
          )}
        </View>
      </Rise>
      <Rise index={2}>
        <Card tone="note">
          <View className="flex-row items-center gap-3">
            <Snail height={SPACING[11]} />
            <Text variant="bodyStrong" className="flex-1">
              {tr.explore.comingSoon}
            </Text>
          </View>
        </Card>
      </Rise>
    </ScrollView>
  );
}
