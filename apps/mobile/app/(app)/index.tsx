import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { tr } from '@/i18n/tr';

export default function HomeScreen() {
  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Text className="text-3xl font-bold text-black">{tr.home.title}</Text>
        <Link href="/settings" className="text-base text-blue-600">
          {tr.home.settings}
        </Link>
      </View>
      <Text className="mt-2 text-base text-neutral-600">{tr.home.placeholder}</Text>
    </Screen>
  );
}
