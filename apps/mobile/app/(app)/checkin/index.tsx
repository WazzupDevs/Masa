import { isWithinCheckinRadius } from '@shared/checkin.ts';
import { CURRENT_LOCATION_CONSENT_VERSION } from '@shared/consent.ts';
import { distanceMeters } from '@shared/explore.ts';
import * as Location from 'expo-location';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Screen } from '@/components/Screen';
import { useProfile } from '@/features/account/useProfile';
import { useCheckinDraft } from '@/features/checkin/draft';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';

type Problem = 'denied' | 'failed' | 'tooFar' | null;

// Check-in, step 1: consent and the position, which only verifies the venue chosen in Keşfet
// (docs/SPEC_V2.md §4). Outside the radius the user is warned here; the server decides anyway.
export default function LocationScreen() {
  const profile = useProfile();
  const venue = useCheckinDraft((s) => s.venue);
  const setPosition = useCheckinDraft((s) => s.setPosition);
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
      if (!isWithinCheckinRadius(distanceMeters(here, venue))) {
        track('checkin_out_of_range', {});
        setProblem('tooFar');
        return;
      }
      setPosition({ ...here, accuracyM: coords.accuracy });
      router.push('/checkin/headcount');
    } catch {
      setProblem('failed');
    } finally {
      setLocating(false);
    }
  }

  if (!venue) return <Redirect href="/explore" />;

  return (
    <Screen>
      <Text className="text-sm text-neutral-500">{venue.name}</Text>
      <Text className="mt-1 text-3xl font-bold text-black">{tr.checkin.locationTitle}</Text>
      <Text className="mt-4 text-base leading-6 text-neutral-700">{tr.checkin.locationBody}</Text>
      {consentGiven ? null : (
        <View className="mt-6">
          <Checkbox
            label={tr.checkin.locationConsent}
            checked={consent}
            onToggle={() => setConsent((v) => !v)}
          />
        </View>
      )}
      {problem === 'denied' ? (
        <View className="mt-4 gap-3">
          <Text className="text-sm text-red-600">{tr.checkin.permissionDenied}</Text>
          <Button
            variant="secondary"
            label={tr.checkin.openSettings}
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
      {problem === 'tooFar' ? (
        <Text className="mt-4 text-sm text-red-600">{tr.errors.too_far}</Text>
      ) : null}
      {problem === 'failed' ? (
        <Text className="mt-4 text-sm text-red-600">{tr.checkin.locationFailed}</Text>
      ) : null}
      <View className="mt-auto pt-8">
        <Button
          label={locating ? tr.checkin.locating : tr.checkin.useLocation}
          onPress={() => void locate()}
          disabled={!(consentGiven || consent)}
          loading={locating}
        />
      </View>
    </Screen>
  );
}
