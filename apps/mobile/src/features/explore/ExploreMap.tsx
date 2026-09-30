import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  type GeoJSONSourceRef,
  Layer,
  type LayerProps,
  Map,
} from '@maplibre/maplibre-react-native';
import {
  type Bounds,
  MAP_ZOOM,
  mapPadding,
  venueBounds,
  venueCollection,
} from '@shared/exploreMap.ts';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TAB_BAR_LIFT } from '@/components/TabBar';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { MAP_FONTS, MAP_PIN, SPACING } from '@/theme/tokens';

import type { ExploreVenue } from './useExploreVenues';
import { BucketBadge, EventTag } from './VenueTags';

// OpenFreeMap by default: no API key in the app and no per-load cost (DECISIONS: map library).
const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

type SymbolLayer = Extract<LayerProps, { type: 'symbol' }>;
type Filter = NonNullable<SymbolLayer['filter']>;

const IS_CLUSTER: Filter = ['has', 'point_count'];
const IS_VENUE: Filter = ['!', ['has', 'point_count']];

type PressedFeature = {
  geometry?: { type: string; coordinates?: unknown };
  properties?: { id?: unknown; cluster_id?: unknown } | null;
};

// Venues coloured by bucket, with an event mark, drawn by GL layers so they stay inside the map and
// under the header (native marker views were drawn over it). Clustered at low zoom; names show from
// MAP_ZOOM.labels on, or for the selected venue. A tap on a cluster zooms in; a tap on a venue
// selects it and opens a short card at the bottom (name, bucket, event, "Mekana git"); a tap on the
// empty map closes it. The user's own position is never shown (docs/SPEC_V2.md §4, rule 6). The
// list view stays the screen reader path.
export function ExploreMap({
  venues,
  headerHeight,
  tabBarHeight,
}: {
  venues: readonly ExploreVenue[];
  // What covers the map's top and bottom edges; the opening camera keeps the venues clear of them.
  headerHeight: number;
  tabBarHeight: number;
}) {
  const { colors, shape } = useTheme();
  const camera = useRef<CameraRef>(null);
  const source = useRef<GeoJSONSourceRef>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // E2E waits on this (testID below): the style, its glyphs and the venue layers are drawn.
  const [ready, setReady] = useState(false);

  const data = useMemo(
    () =>
      venueCollection(
        venues.map((v) => ({
          id: v.id,
          name: v.name,
          lat: v.lat,
          lng: v.lng,
          bucket: v.bucket,
          hasEvent: v.event !== null,
        })),
      ),
    [venues],
  );
  // The opening view only: later data refreshes do not move the map under the user's finger.
  const [opening] = useState<Bounds | null>(() => venueBounds(venues));
  const padding = mapPadding(headerHeight, tabBarHeight, SPACING[6]);
  // A venue that left the data (deactivated) closes its card.
  const card = selected ? (venues.find((v) => v.id === selected) ?? null) : null;

  if (!opening) return null;
  // Pale pins on a pale map need a ring to stay findable (3:1 for UI shapes).
  const ring = shape.stroke.card > 1 ? colors.border : colors.accent;
  const label: { layout: NonNullable<SymbolLayer['layout']>; paint: SymbolLayer['paint'] } = {
    layout: {
      'text-field': ['get', 'name'],
      'text-font': [...MAP_FONTS.regular],
      'text-size': MAP_PIN.labelSize,
      'text-anchor': 'top',
      'text-offset': [0, MAP_PIN.labelOffset],
    },
    paint: {
      'text-color': colors.text,
      'text-halo-color': colors.surface,
      'text-halo-width': MAP_PIN.labelHalo,
    },
  };

  async function onFeature(feature: PressedFeature | undefined) {
    const props = feature?.properties;
    const coords = feature?.geometry?.coordinates;
    if (typeof props?.cluster_id === 'number' && Array.isArray(coords)) {
      const zoom = await source.current?.getClusterExpansionZoom(props.cluster_id);
      camera.current?.flyTo({
        center: [Number(coords[0]), Number(coords[1])],
        zoom: zoom ?? MAP_ZOOM.labels,
        duration: 400,
      });
      return;
    }
    const id = typeof props?.id === 'string' ? props.id : null;
    if (id) setSelected(id);
  }

  return (
    <View
      style={{ flex: 1 }}
      collapsable={false}
      testID={ready ? 'explore-map-ready' : 'explore-map'}
    >
      <Map
        mapStyle={MAP_STYLE_URL}
        style={{ flex: 1 }}
        logo={false}
        attribution
        accessibilityLabel={tr.explore.mapLabel}
        onPress={() => setSelected(null)}
        onDidFinishRenderingMapFully={() => setReady(true)}
      >
        <Camera ref={camera} initialViewState={{ bounds: opening, padding }} />
        <GeoJSONSource
          id="venues"
          ref={source}
          data={data as GeoJSON.FeatureCollection}
          cluster
          clusterMaxZoom={MAP_ZOOM.clusterMax}
          onPress={(event) => {
            event.stopPropagation();
            void onFeature(event.nativeEvent.features[0] as PressedFeature | undefined);
          }}
        >
          <Layer
            id="venue-clusters"
            type="circle"
            filter={IS_CLUSTER}
            paint={{
              'circle-color': colors.accent,
              'circle-radius': [
                'step',
                ['get', 'point_count'],
                MAP_PIN.clusterRadius[0],
                MAP_PIN.clusterSteps[0],
                MAP_PIN.clusterRadius[1],
                MAP_PIN.clusterSteps[1],
                MAP_PIN.clusterRadius[2],
              ],
              'circle-stroke-width': MAP_PIN.ring,
              'circle-stroke-color': colors.surface,
            }}
          />
          <Layer
            id="venue-cluster-count"
            type="symbol"
            filter={IS_CLUSTER}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font': [...MAP_FONTS.bold],
              'text-size': MAP_PIN.countSize,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': colors.onAccent }}
          />
          <Layer
            id="venue-ring"
            type="circle"
            filter={IS_VENUE}
            paint={{
              'circle-color': ring,
              'circle-radius': MAP_PIN.radius + MAP_PIN.ring + MAP_PIN.outline,
            }}
          />
          <Layer
            id="venue-pins"
            type="circle"
            filter={IS_VENUE}
            paint={{
              'circle-color': [
                'match',
                ['get', 'bucket'],
                'lively',
                colors.lively,
                'buzzing',
                colors.buzz,
                colors.calm,
              ],
              'circle-radius': MAP_PIN.radius,
              'circle-stroke-width': MAP_PIN.ring,
              'circle-stroke-color': colors.surface,
            }}
          />
          <Layer
            id="venue-events"
            type="circle"
            filter={['all', ['!', ['has', 'point_count']], ['to-boolean', ['get', 'event']]]}
            paint={{
              'circle-color': colors.event,
              'circle-radius': MAP_PIN.eventDot,
              'circle-stroke-width': MAP_PIN.outline,
              'circle-stroke-color': colors.surface,
              'circle-translate': [MAP_PIN.eventOffset, -MAP_PIN.eventOffset],
            }}
          />
          <Layer
            id="venue-labels"
            type="symbol"
            minzoom={MAP_ZOOM.labels}
            filter={IS_VENUE}
            layout={label.layout}
            paint={label.paint}
          />
          <Layer
            id="venue-label-selected"
            type="symbol"
            filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selected ?? '']]}
            layout={{ ...label.layout, 'text-allow-overlap': true }}
            paint={label.paint}
          />
        </GeoJSONSource>
      </Map>
      {card ? <VenueCard venue={card} /> : null}
    </View>
  );
}

// The selected venue, above the tab bar's raised disc. Existing components for now; the design
// session replaces the look.
function VenueCard({ venue }: { venue: ExploreVenue }) {
  return (
    <View
      className="absolute inset-x-0"
      style={{ bottom: SPACING[4] + TAB_BAR_LIFT, paddingHorizontal: SPACING[4] }}
    >
      <Card testID="explore-map-card">
        <Text variant="title">{venue.name}</Text>
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          <BucketBadge bucket={venue.bucket} />
          {venue.event ? <EventTag event={venue.event} /> : null}
        </View>
        <View className="mt-3">
          <Button
            label={tr.explore.goToVenue}
            icon="arrow-forward"
            testID="explore-map-go"
            onPress={() =>
              router.push({ pathname: '/explore/[venueId]', params: { venueId: venue.id } })
            }
          />
        </View>
      </Card>
    </View>
  );
}
