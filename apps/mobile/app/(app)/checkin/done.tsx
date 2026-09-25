import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { tr } from '@/i18n/tr';

export default function DoneScreen() {
  const { alias } = useLocalSearchParams<{ alias: string }>();
  const queryClient = useQueryClient();

  async function finish() {
    await queryClient.invalidateQueries({ queryKey: ['activeTable'] });
    router.dismissTo('/venue');
  }

  return (
    <Screen>
      <Text className="text-3xl font-bold text-black">{tr.checkin.doneTitle}</Text>
      <Text className="mt-4 text-base text-neutral-600">{tr.checkin.doneBody}</Text>
      <Text className="mt-6 text-center text-4xl font-bold text-black">{alias}</Text>
      <View className="mt-auto pt-8">
        <Button label={tr.checkin.continue} onPress={() => void finish()} />
      </View>
    </Screen>
  );
}
