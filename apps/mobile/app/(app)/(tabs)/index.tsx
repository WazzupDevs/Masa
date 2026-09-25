import { hasActiveTable } from '@shared/navigation.ts';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { tr } from '@/i18n/tr';
import { useNow } from '@/lib/useNow';

// Keşfet, the opening screen. Until the venue list and map arrive (docs/SPEC_V2.md §12, step 2)
// it offers check-in, or the way back to the active table.
export default function ExploreScreen() {
  const table = useActiveTable();
  const now = useNow(30_000);
  const active = hasActiveTable(table.data, now);

  return (
    <Screen>
      <Text className="text-3xl font-bold text-black">{tr.home.title}</Text>
      <Text className="mt-2 text-base text-neutral-600">{tr.home.hint}</Text>
      <View className="mt-auto gap-3 pt-8">
        {active ? (
          <Button label={tr.explore.backToVenue} onPress={() => router.navigate('/venue')} />
        ) : null}
        <Button
          variant={active ? 'secondary' : 'primary'}
          label={tr.home.checkIn}
          onPress={() => router.push('/checkin')}
        />
      </View>
    </Screen>
  );
}
