import { Redirect, router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useCheckinDraft } from '@/features/checkin/draft';
import { SpotPicker } from '@/features/checkin/SpotPicker';
import { useVenueSpots } from '@/features/checkin/spots';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';

// Check-in at a venue with spots, before "Kaç kişisiniz?": where the table is (docs/SPEC_V3.md
// §4.3). The spot is the table's own statement; no position is taken for it.
export default function SpotScreen() {
  const { colors } = useTheme();
  const { venue, position, spot, setSpot } = useCheckinDraft();
  const spots = useVenueSpots(venue?.id);

  if (!venue) return <Redirect href="/explore" />;
  if (!position) return <Redirect href="/checkin" />;

  return (
    <Screen>
      <ScreenHeader
        eyebrow={venue.name}
        eyebrowIcon="location-outline"
        title={tr.checkin.spotTitle}
        subtitle={tr.checkin.spotHint}
        onBack={() => router.back()}
      />
      <View className="mt-4">
        {spots.isPending ? <ActivityIndicator className="mt-8" color={colors.muted} /> : null}
        <SpotPicker
          spots={spots.data ?? []}
          selectedId={spot?.id ?? null}
          onSelect={(s) => setSpot({ id: s.id, name: s.name })}
        />
      </View>
      <View className="mt-auto pt-8">
        <Button
          label={tr.checkin.continue}
          onPress={() => router.push('/checkin/headcount')}
          disabled={!spot}
        />
      </View>
    </Screen>
  );
}
