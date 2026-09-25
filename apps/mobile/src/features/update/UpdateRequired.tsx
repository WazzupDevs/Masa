import { Linking, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { tr } from '@/i18n/tr';
import { appBuild, updateUrl } from '@/lib/appBuild';

// Full screen, in place of everything else, once the server refuses this build.
export function UpdateRequired() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center gap-4 px-8">
        <Text className="text-3xl font-bold text-black">{tr.update.title}</Text>
        <Text className="text-base text-neutral-700">{tr.update.body}</Text>
        <View className="mt-4">
          <Button label={tr.update.action} onPress={() => void Linking.openURL(updateUrl())} />
        </View>
        {appBuild ? (
          <Text className="text-center text-sm text-neutral-500">{tr.update.build(appBuild)}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
