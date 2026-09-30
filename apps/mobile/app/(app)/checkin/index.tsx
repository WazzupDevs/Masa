import { BOUNDARY_TOLERANCE_M, isWithinCheckinRadius } from '@shared/checkin.ts';
import { CURRENT_LOCATION_CONSENT_VERSION } from '@shared/consent.ts';
import { distanceMeters } from '@shared/explore.ts';
import { withinBoundary } from '@shared/geo.ts';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { useCheckinDraft } from '@/features/checkin/draft';
import { useVenueSpots } from '@/features/checkin/spots';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON } from '@/theme/tokens';

type Problem = 'denied' | 'failed' | 'tooFar' | 'outsideBoundary' | null;

// Check-in, step 1: consent and the position, which only verifies the venue chosen in Keşfet
// (docs/SPEC_V2.md §4). Outside the radius, or the boundary with its tolerance (docs/SPEC_V3.md
// §4.2), the user is warned here; the server decides anyway. A venue with spots asks "Neredesin?"
// next.
export default function LocationScreen() {
  const { colors } = useTheme();
  const profile = useProfile();
  const venue = useCheckinDraft((s) => s.venue);
  const setPosition = useCheckinDraft((s) => s.setPosition);
  const spots = useVenueSpots(venue?.id);
  const consentGiven = profile.data?.location_consent_version === CURRENT_LOCATION_CONSENT_VERSION;
  const [consent, setConsent] = useState(false);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  async function locate() {
    setProblem(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setProblem('denied');
      return;
    }
    setLocating(true);
    try {
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (!venue) return;
      const here = { lat: coords.latitude, lng: coords.longitude };
      const inside = venue.boundary
        ? withinBoundary(here, venue.boundary, BOUNDARY_TOLERANCE_M)
        : isWithinCheckinRadius(distanceMeters(here, venue));
      if (!inside) {
        track('checkin_out_of_range', {});
        setProblem(venue.boundary ? 'outsideBoundary' : 'tooFar');
        return;
      }
      setPosition({ ...here, accuracyM: coords.accuracy });
      router.push((spots.data ?? []).length > 0 ? '/checkin/spot' : '/checkin/headcount');
    } catch {
      setProblem('failed');
    } finally {
      setLocating(false);
    }
  }

  if (!venue) return <Redirect href="/explore" />;

  return (
    <Screen>
      <ScreenHeader
        eyebrow={venue.name}
        eyebrowIcon="location-outline"
        title={tr.checkin.locationTitle}
        onBack={() => router.back()}
      />
      <Card className="mt-4">
        <View className="flex-row gap-3">
          <Ionicons name="shield-checkmark-outline" size={ICON.md} color={colors.text} />
          <Text className="flex-1">{tr.checkin.locationBody}</Text>
        </View>
      </Card>
      {consentGiven ? null : (
        <View className="mt-4">
          <Checkbox
            label={tr.checkin.locationConsent}
            checked={consent}
            onToggle={() => setConsent((v) => !v)}
          />
        </View>
      )}
      {problem === 'denied' ? (
        <View className="mt-4 gap-3">
          <Text variant="fine" tone="danger">
            {tr.checkin.permissionDenied}
          </Text>
          <Button
            variant="secondary"
            label={tr.checkin.openSettings}
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
      {problem === 'tooFar' ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {tr.errors.too_far}
        </Text>
      ) : null}
      {problem === 'outsideBoundary' ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {tr.checkin.outsideBoundary}
        </Text>
      ) : null}
      {problem === 'failed' ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {tr.checkin.locationFailed}
        </Text>
      ) : null}
      <View className="mt-auto pt-8">
        <Button
          label={locating ? tr.checkin.locating : tr.checkin.useLocation}
          onPress={() => void locate()}
          disabled={!(consentGiven || consent) || spots.isPending}
          loading={locating}
        />
      </View>
    </Screen>
  );
}
