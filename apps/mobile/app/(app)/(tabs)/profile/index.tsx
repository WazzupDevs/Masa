import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { tr } from '@/i18n/tr';

// Profile; photo, bio and badges arrive in docs/SPEC_V2.md §12, step 3. Settings open only from
// the gear here (top right).
export default function ProfileScreen() {
  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Text className="text-3xl font-bold text-black">{tr.tabs.profile}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr.settings.title}
          hitSlop={12}
          onPress={() => router.push('/profile/settings')}
        >
          <Ionicons name="settings-outline" size={26} color="black" />
        </Pressable>
      </View>
      <Text className="mt-2 text-base text-neutral-600">{tr.profile.soon}</Text>
    </Screen>
  );
}
