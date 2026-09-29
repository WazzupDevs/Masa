import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { useCheckinDraft } from '@/features/checkin/draft';
import { useExploreVenue } from '@/features/explore/useExploreVenues';
import { BucketBadge, EventTag } from '@/features/explore/VenueTags';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';

// A venue from Keşfet: its bucket, its event, and check-in. Choosing the venue here is the manual
// selection; the position is taken next only to verify it (docs/SPEC_V2.md §4).
export default function VenueDetailScreen() {
  const { colors } = useTheme();
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const { venue, isPending } = useExploreVenue(venueId);
  const setVenue = useCheckinDraft((s) => s.setVenue);

  if (isPending) {
    return (
      <Screen>
        <ActivityIndicator className="mt-16" color={colors.muted} />
      </Screen>
    );
  }
  if (!venue) {
    return (
      <Screen>
        <View className="flex-1 justify-center">
          <EmptyState
            icon="cafe-outline"
            body={tr.explore.notFound}
            action={{ label: tr.explore.back, onPress: () => router.back() }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={venue.name} subtitle={venue.district} onBack={() => router.back()} />
      <View className="mt-3 flex-row flex-wrap gap-1.5">
        <BucketBadge bucket={venue.bucket} />
        {venue.event ? <EventTag event={venue.event} /> : null}
      </View>
      <Card tone="note" className="mt-6">
        <Text variant="fine">{tr.explore.checkInHint}</Text>
      </Card>
      <View className="mt-auto gap-3 pt-8">
        <Button
          label={tr.explore.checkInHere}
          icon="location-outline"
          onPress={() => {
            setVenue({ id: venue.id, name: venue.name, lat: venue.lat, lng: venue.lng });
            router.push('/checkin');
          }}
        />
      </View>
    </Screen>
  );
}
