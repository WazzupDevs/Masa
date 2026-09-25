import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
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
      <ScreenHeader title={tr.checkin.doneTitle} subtitle={tr.checkin.doneBody} />
      <Card className="mt-4">
        <Text variant="label">{tr.venue.yourTable}</Text>
        <Text variant="alias" className="mt-0.5">
          {alias}
        </Text>
      </Card>
      <View className="mt-auto pt-8">
        <Button label={tr.checkin.continue} onPress={() => void finish()} />
      </View>
    </Screen>
  );
}
