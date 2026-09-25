import { router } from 'expo-router';
import { View } from 'react-native';

import { tr } from '@/i18n/tr';

import { Button } from './Button';
import { Screen } from './Screen';
import { ScreenHeader } from './ScreenHeader';
import { Text } from './Text';

export function LegalText({ title, body }: { title: string; body: string }) {
  return (
    <Screen>
      <ScreenHeader title={title} subtitle={tr.legal.draftNotice} onBack={() => router.back()} />
      <Text className="mt-4">{body}</Text>
      <View className="mt-auto pt-8">
        <Button variant="secondary" label={tr.common.continue} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
