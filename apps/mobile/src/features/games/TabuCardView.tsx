import { View } from 'react-native';

import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';

export function TabuCardView({ word, forbidden }: { word: string; forbidden: readonly string[] }) {
  return (
    <Card>
      <View className="items-center py-1">
        <Text variant="word" align="center">
          {word.toLocaleUpperCase('tr-TR')}
        </Text>
        <Text variant="overline" className="mb-1.5 mt-3">
          {tr.games.forbiddenLabel}
        </Text>
        <View className="items-center gap-1">
          {forbidden.map((f) => (
            <Text key={f} variant="forbidden">
              {f}
            </Text>
          ))}
        </View>
      </View>
    </Card>
  );
}
