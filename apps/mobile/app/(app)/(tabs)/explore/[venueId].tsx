import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useCheckinDraft } from '@/features/checkin/draft';
import { useExploreVenue } from '@/features/explore/useExploreVenues';
import { BucketBadge, EventTag } from '@/features/explore/VenueTags';
import { tr } from '@/i18n/tr';

// A venue from Keşfet: its bucket, its event, and check-in. Choosing the venue here is the manual
// selection; the position is taken next only to verify it (docs/SPEC_V2.md §4).
export default function VenueDetailScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const { venue, isPending } = useExploreVenue(venueId);
  const setVenue = useCheckinDraft((s) => s.setVenue);

  if (isPending) {
    return (
      <Screen>
        <ActivityIndicator className="mt-16" />
      </Screen>
    );
  }
  if (!venue) {
    return (
      <Screen>
        <Text className="text-base text-neutral-600">{tr.explore.notFound}</Text>
        <View className="mt-auto pt-8">
          <Button variant="secondary" label={tr.explore.back} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text className="text-3xl font-bold text-black">{venue.name}</Text>
      <Text className="mt-1 text-base text-neutral-500">{venue.district}</Text>
      <View className="mt-4 gap-3">
        <BucketBadge bucket={venue.bucket} />
        {venue.event ? <EventTag event={venue.event} /> : null}
      </View>
      <Text className="mt-6 text-sm text-neutral-600">{tr.explore.checkInHint}</Text>
      <View className="mt-auto gap-3 pt-8">
        <Button
          label={tr.explore.checkInHere}
          onPress={() => {
            setVenue({ id: venue.id, name: venue.name, lat: venue.lat, lng: venue.lng });
            router.push('/checkin');
          }}
        />
      </View>
    </Screen>
  );
}
