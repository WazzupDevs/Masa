import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { tr } from '@/i18n/tr';

import { Button } from './Button';
import { Screen } from './Screen';

export function LegalText({ title, body }: { title: string; body: string }) {
  return (
    <Screen>
      <Text className="text-2xl font-bold text-black">{title}</Text>
      <Text className="mt-2 text-sm text-neutral-500">{tr.legal.draftNotice}</Text>
      <Text className="mt-6 text-base leading-6 text-black">{body}</Text>
      <View className="mt-auto pt-8">
        <Button variant="secondary" label={tr.common.continue} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
