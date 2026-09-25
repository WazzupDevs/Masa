import { Text } from 'react-native';

import { Screen } from '@/components/Screen';
import { tr } from '@/i18n/tr';

// Friends and DMs arrive in docs/SPEC_V2.md §12, step 4.
export default function FriendsScreen() {
  return (
    <Screen>
      <Text className="text-3xl font-bold text-black">{tr.tabs.friends}</Text>
      <Text className="mt-2 text-base text-neutral-600">{tr.friends.soon}</Text>
    </Screen>
  );
}
