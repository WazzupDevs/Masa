import { CURRENT_LOCATION_CONSENT_VERSION } from '@shared/consent.ts';
import { HEADCOUNT_OPTIONS } from '@shared/checkin.ts';
import { PARTICIPATIONS, type Participation } from '@shared/profile.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Choice } from '@/components/Choice';
import { Screen } from '@/components/Screen';
import { useProfile } from '@/features/account/useProfile';
import { useCheckinDraft } from '@/features/checkin/draft';
import { participationHint } from '@/features/profile/ProfileSettings';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { callCheckIn } from '@/lib/api';

type Choices = { headcount: number; participation: Participation };

// "Kaç kişisiniz?" 1 / 2 / 3 / 4+ and, for this table only, anonymous or with the profile
// (docs/SPEC_V2.md §5.4, §6.6). The default comes from Ayarlar → Gizlilik.
export default function HeadcountScreen() {
  const queryClient = useQueryClient();
  const profile = useProfile();
  const { position, venue, clear } = useCheckinDraft();
  const [headcount, setHeadcount] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Participation | null>(null);

  const hasName = !!profile.data?.display_name;
  const fallback: Participation =
    profile.data?.default_participation === 'profile' && hasName ? 'profile' : 'anonymous';
  const participation = chosen ?? fallback;

  const checkIn = useMutation({
    mutationFn: (choices: Choices) => {
      if (!position || !venue) throw new Error('No check-in draft');
      return callCheckIn({
        action: 'check-in',
        venueId: venue.id,
        lat: position.lat,
        lng: position.lng,
        accuracyM: position.accuracyM,
        headcount: choices.headcount,
        locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
        participation: choices.participation,
      });
    },
    onSuccess: async (result, choices) => {
      track('check_in', { headcount: choices.headcount });
      track('participation_chosen', { mode: choices.participation });
      clear();
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      router.replace({ pathname: '/checkin/done', params: { alias: result.alias } });
    },
  });

  if (!venue) return <Redirect href="/explore" />;
  if (!position) return <Redirect href="/checkin" />;

  return (
    <Screen>
      <Text className="text-sm text-neutral-500">{venue.name}</Text>
      <Text className="mt-1 text-3xl font-bold text-black">{tr.checkin.headcountTitle}</Text>
      <Text className="mt-2 text-base text-neutral-600">{tr.checkin.headcountHint}</Text>
      <View className="mt-6 flex-row flex-wrap gap-3">
        {HEADCOUNT_OPTIONS.map((n) => (
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
              {tr.checkin.headcountOption(n)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mt-8 text-xl font-bold text-black">{tr.participation.title}</Text>
      <View className="mt-3 gap-2">
        {PARTICIPATIONS.map((mode) => (
          <Choice
            key={mode}
            label={tr.participation[mode]}
            hint={participationHint(mode, hasName)}
            selected={participation === mode}
            disabled={mode === 'profile' && !hasName}
            onPress={() => setChosen(mode)}
          />
        ))}
      </View>

      {checkIn.isError ? (
        <Text className="mt-4 text-sm text-red-600">{errorMessage(checkIn.error)}</Text>
      ) : null}
      <View className="mt-auto pt-8">
        <Button
          label={tr.checkin.open}
          onPress={() => headcount !== null && checkIn.mutate({ headcount, participation })}
          disabled={headcount === null}
          loading={checkIn.isPending}
        />
      </View>
    </Screen>
  );
}
