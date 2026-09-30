import { PARTICIPATIONS, type Participation } from '@shared/profile.ts';
import { type Intent, INTENTS } from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Choice } from '@/components/Choice';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/account/useProfile';
import { registerForPush } from '@/features/push/push';
import { participationHint } from '@/features/rooms/participation';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';

// "Oda kur" (docs/SPEC_V3.md §5.1): always open to the venue, no game chosen; an optional intent
// label and, for this room, anonymous or with the profile (§5.4; anonymous by default).
export default function NewRoomScreen() {
  const queryClient = useQueryClient();
  const profile = useProfile();
  const hasName = !!profile.data?.display_name;
  const [intent, setIntent] = useState<Intent | null>(null);
  const [participation, setParticipation] = useState<Participation>('anonymous');

  const create = useMutation({
    mutationFn: () =>
      roomsApi.create({
        profiled: participation === 'profile',
        ...(intent ? { intent } : {}),
      }),
    onSuccess: async ({ roomId }) => {
      track('room_created', { intent: intent ?? 'none', profiled: participation === 'profile' });
      track('participation_chosen', { mode: participation });
      void registerForPush();
      await queryClient.invalidateQueries({ queryKey: roomKeys.current });
      router.replace({ pathname: '/room/[id]', params: { id: roomId } });
    },
  });

  return (
    <Screen>
      <ScreenHeader
        title={tr.rooms.newTitle}
        subtitle={tr.rooms.newHint}
        onBack={() => router.back()}
      />
      <Text variant="label" className="mt-4">
        {tr.rooms.intentLabel}
      </Text>
      <View accessibilityRole="radiogroup" className="mt-2 gap-2">
        <Choice
          testID="intent-none"
          label={tr.rooms.intentNone}
          selected={intent === null}
          onPress={() => setIntent(null)}
        />
        {INTENTS.map((i) => (
          <Choice
            key={i}
            testID={`intent-${i}`}
            label={tr.intents[i]}
            hint={tr.rooms.intentHint[i]}
            selected={intent === i}
            onPress={() => setIntent(i)}
          />
        ))}
      </View>
      <Text variant="label" className="mt-6">
        {tr.participation.title}
      </Text>
      <View accessibilityRole="radiogroup" className="mt-2 gap-2">
        {PARTICIPATIONS.map((mode) => (
          <Choice
            key={mode}
            testID={`participation-${mode}`}
            label={tr.participation[mode]}
            hint={participationHint(mode, hasName)}
            selected={participation === mode}
            disabled={mode === 'profile' && !hasName}
            onPress={() => setParticipation(mode)}
          />
        ))}
      </View>
      {create.isError ? (
        <Text variant="fine" tone="danger" className="mt-4">
          {errorMessage(create.error)}
        </Text>
      ) : null}
      <View className="mt-auto pt-8">
        <Button
          label={tr.rooms.createConfirm}
          onPress={() => create.mutate()}
          loading={create.isPending}
        />
      </View>
    </Screen>
  );
}
