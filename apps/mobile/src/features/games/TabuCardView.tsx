import { Text, View } from 'react-native';

import { tr } from '@/i18n/tr';

export function TabuCardView({ word, forbidden }: { word: string; forbidden: readonly string[] }) {
  return (
    <View className="items-center rounded-2xl bg-white p-5">
      <Text className="text-3xl font-bold text-black">{word}</Text>
      <Text className="mt-4 text-xs font-semibold uppercase text-neutral-400">
        {tr.games.forbiddenLabel}
      </Text>
      {forbidden.map((f) => (
        <Text key={f} className="mt-1 text-lg text-red-600">
          {f}
        </Text>
      ))}
    </View>
  );
}
