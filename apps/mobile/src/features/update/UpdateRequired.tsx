import { Linking, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { appBuild, updateUrl } from '@/lib/appBuild';

// Full screen, in place of everything else, once the server refuses this build.
export function UpdateRequired() {
  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <EmptyState icon="cloud-download-outline" title={tr.update.title} body={tr.update.body} />
        <Button label={tr.update.action} onPress={() => void Linking.openURL(updateUrl())} />
        {appBuild ? (
          <Text variant="fine" align="center">
            {tr.update.build(appBuild)}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
