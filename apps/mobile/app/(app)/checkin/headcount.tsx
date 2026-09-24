import { CURRENT_LOCATION_CONSENT_VERSION } from '@shared/consent.ts';
import { MAX_HEADCOUNT, MIN_HEADCOUNT } from '@shared/checkin.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useCheckinDraft } from '@/features/checkin/draft';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { callCheckIn } from '@/lib/api';

const COUNTS = Array.from(
  { length: MAX_HEADCOUNT - MIN_HEADCOUNT + 1 },
  (_, i) => MIN_HEADCOUNT + i,
);

export default function HeadcountScreen() {
  const queryClient = useQueryClient();
  const { position, venue, clear } = useCheckinDraft();
  const [headcount, setHeadcount] = useState<number | null>(null);

  const checkIn = useMutation({
    mutationFn: (count: number) => {
      if (!position || !venue) throw new Error('No check-in draft');
      return callCheckIn({
        action: 'check-in',
        venueId: venue.id,
        lat: position.lat,
        lng: position.lng,
        accuracyM: position.accuracyM,
        headcount: count,
        locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
      });
    },
    onSuccess: async (result) => {
      clear();
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      router.replace({ pathname: '/checkin/done', params: { alias: result.alias } });
    },
  });

  if (!position || !venue) return <Redirect href="/checkin" />;

  return (
    <Screen>
      <Text className="text-sm text-neutral-500">{venue.name}</Text>
      <Text className="mt-1 text-3xl font-bold text-black">{tr.checkin.headcountTitle}</Text>
      <Text className="mt-2 text-base text-neutral-600">{tr.checkin.headcountHint}</Text>
      <View className="mt-8 flex-row flex-wrap gap-3">
        {COUNTS.map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ selected: headcount === n }}
            onPress={() => setHeadcount(n)}
            className={`h-14 w-14 items-center justify-center rounded-xl border-2 ${headcount === n ? 'border-black bg-black' : 'border-neutral-300'}`}
          >
            <Text
              className={`text-xl font-semibold ${headcount === n ? 'text-white' : 'text-black'}`}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
      {checkIn.isError ? (
        <Text className="mt-4 text-sm text-red-600">{errorMessage(checkIn.error)}</Text>
      ) : null}
      <View className="mt-auto pt-8">
        <Button
          label={tr.checkin.open}
          onPress={() => headcount !== null && checkIn.mutate(headcount)}
          disabled={headcount === null}
          loading={checkIn.isPending}
        />
      </View>
    </Screen>
  );
}
