import { CONCEPTS, type Concept, VISIBILITIES, type Visibility } from '@shared/rooms.ts';
import { conceptMode } from '@shared/concepts.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Choice } from '@/components/Choice';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { registerForPush } from '@/features/push/push';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';

export default function NewRoomScreen() {
  const params = useLocalSearchParams<{ visibility?: string }>();
  const queryClient = useQueryClient();
  const [concept, setConcept] = useState<Concept>('tabu');
  const [visibility, setVisibility] = useState<Visibility>(
    params.visibility === 'private' ? 'private' : 'open',
  );

  const create = useMutation({
    mutationFn: () => roomsApi.create({ concept, visibility }),
    onSuccess: async ({ roomId }) => {
      track('room_created', { concept, visibility });
      if (visibility === 'open') void registerForPush();
      await queryClient.invalidateQueries({ queryKey: roomKeys.current });
      router.replace({ pathname: '/room/[id]', params: { id: roomId } });
    },
  });

  return (
    <Screen>
      <ScreenHeader title={tr.rooms.newTitle} onBack={() => router.back()} />
      <Text variant="label" className="mt-4">
        {tr.rooms.conceptLabel}
      </Text>
      <View accessibilityRole="radiogroup" className="mt-2 gap-2">
        {CONCEPTS.map((c) => (
          <Choice
            key={c}
            label={tr.concepts[c]}
            hint={conceptMode(c) === 'voice' ? tr.voiceNote : undefined}
            selected={concept === c}
            onPress={() => setConcept(c)}
          />
        ))}
      </View>
      <Text variant="label" className="mt-6">
        {tr.rooms.visibilityLabel}
      </Text>
      <View accessibilityRole="radiogroup" className="mt-2 gap-2">
        {VISIBILITIES.map((v) => (
          <Choice
            key={v}
            label={tr.rooms.visibility[v]}
            hint={tr.rooms.visibilityHint[v]}
            selected={visibility === v}
            onPress={() => setVisibility(v)}
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
