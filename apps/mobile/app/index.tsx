import { Text, View } from 'react-native';

import { tr } from '@/i18n/tr';

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-3xl font-bold text-black">{tr.app.name}</Text>
      <Text className="mt-2 text-base text-neutral-500">{tr.app.placeholder}</Text>
    </View>
  );
}
