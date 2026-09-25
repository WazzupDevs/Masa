import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { tr } from '@/i18n/tr';

import type { ExploreVenue } from './useExploreVenues';
import { BUCKET_COLOR } from './VenueTags';

// OpenFreeMap by default: no API key in the app and no per-load cost (DECISIONS: map library).
const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

function center(venues: readonly ExploreVenue[]): [number, number] {
  const n = venues.length;
  return [venues.reduce((s, v) => s + v.lng, 0) / n, venues.reduce((s, v) => s + v.lat, 0) / n];
}

// Venues coloured by bucket, with the event label under the name. The user's own position is
// never shown (docs/SPEC_V2.md §4, rule 6).
export function ExploreMap({ venues }: { venues: readonly ExploreVenue[] }) {
  if (venues.length === 0) return null;
  return (
    <Map mapStyle={MAP_STYLE_URL} style={{ flex: 1 }} logo={false} attribution>
      <Camera initialViewState={{ center: center(venues), zoom: 13 }} />
      {venues.map((v) => (
        <Marker key={v.id} id={v.id} lngLat={[v.lng, v.lat]} anchor="bottom">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${v.name}, ${tr.explore.buckets[v.bucket]}`}
            onPress={() =>
              router.push({ pathname: '/explore/[venueId]', params: { venueId: v.id } })
            }
            className="items-center"
          >
            <View className="rounded-lg bg-white px-2 py-1 shadow">
              <Text className="text-xs font-semibold text-black">{v.name}</Text>
              {v.event ? (
                <Text className="text-[10px] font-semibold text-violet-800">
                  {tr.explore.eventShort}
                </Text>
              ) : null}
            </View>
            <View
              className="mt-1 h-4 w-4 rounded-full border-2 border-white"
              style={{ backgroundColor: BUCKET_COLOR[v.bucket] }}
            />
          </Pressable>
        </Marker>
      ))}
    </Map>
  );
}
