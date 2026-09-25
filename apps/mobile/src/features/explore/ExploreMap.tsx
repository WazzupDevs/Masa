import { Ionicons } from '@expo/vector-icons';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import type { ExploreVenue } from './useExploreVenues';
import { BUCKET_TAG } from './VenueTags';

// OpenFreeMap by default: no API key in the app and no per-load cost (DECISIONS: map library).
const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

// The mockup's pin: a disc in the bucket colour with a surface ring, the name below, and a small
// event mark on its shoulder.
const PIN = { size: 36, ring: 3, eventDot: 20, eventRing: 2 } as const;
const PIN_COLORS = {
  calm: ['calm', 'onCalm'],
  lively: ['lively', 'onLively'],
  buzz: ['buzz', 'onBuzz'],
} as const;

function center(venues: readonly ExploreVenue[]): [number, number] {
  const n = venues.length;
  return [venues.reduce((s, v) => s + v.lng, 0) / n, venues.reduce((s, v) => s + v.lat, 0) / n];
}

// Venues coloured by bucket, with an event mark. The user's own position is never shown
// (docs/SPEC_V2.md §4, rule 6).
export function ExploreMap({ venues }: { venues: readonly ExploreVenue[] }) {
  const { colors, shape } = useTheme();
  if (venues.length === 0) return null;
  // Pale pins on a pale map need a ring to stay findable (3:1 for UI shapes).
  const ring = shape.stroke.card > 1 ? colors.border : colors.accent;
  return (
    <Map mapStyle={MAP_STYLE_URL} style={{ flex: 1 }} logo={false} attribution>
      <Camera initialViewState={{ center: center(venues), zoom: 13 }} />
      {venues.map((v) => {
        const [fill, glyph] = PIN_COLORS[BUCKET_TAG[v.bucket]];
        return (
          <Marker key={v.id} id={v.id} lngLat={[v.lng, v.lat]} anchor="bottom">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${v.name}, ${tr.explore.buckets[v.bucket]}${v.event ? `, ${tr.explore.eventShort}` : ''}`}
              onPress={() =>
                router.push({ pathname: '/explore/[venueId]', params: { venueId: v.id } })
              }
              style={{ alignItems: 'center', gap: SPACING[0.5], minWidth: TOUCH.min }}
            >
              <View
                className="items-center justify-center"
                style={{
                  width: PIN.size,
                  height: PIN.size,
                  borderRadius: shape.radius.pill,
                  backgroundColor: colors[fill],
                  borderWidth: PIN.ring,
                  borderColor: colors.surface,
                  boxShadow: `0px 0px 0px 2px ${ring}, 0px 4px 10px rgba(0, 0, 0, 0.2)`,
                }}
              >
                <Ionicons name="cafe" size={ICON.sm} color={colors[glyph]} />
                {v.event ? (
                  <View
                    className="absolute items-center justify-center"
                    style={{
                      top: -SPACING[1.5],
                      right: -SPACING[2],
                      width: PIN.eventDot,
                      height: PIN.eventDot,
                      borderRadius: shape.radius.pill,
                      backgroundColor: colors.event,
                      borderWidth: PIN.eventRing,
                      borderColor: colors.surface,
                    }}
                  >
                    <Ionicons name="sparkles" size={ICON.xs} color={colors.onEvent} />
                  </View>
                ) : null}
              </View>
              <View
                style={{
                  paddingHorizontal: SPACING[1.5],
                  paddingVertical: SPACING[0.5],
                  borderRadius: shape.radius.sm / 2,
                  backgroundColor: colors.surface,
                }}
              >
                <Text variant="caption">{v.name}</Text>
              </View>
            </Pressable>
          </Marker>
        );
      })}
    </Map>
  );
}
