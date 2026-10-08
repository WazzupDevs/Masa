import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PREVIEW_SETS } from '@/features/design/previews';
import { tr } from '@/i18n/tr';
import { designPickerEnabled } from '@/theme/ThemeProvider';

// Ayarlar → Tasarım (test) → Bileşen önizleme: the game components with sample props, for the
// design review and E2E screenshots. Test builds only; production redirects away.
export default function DesignPreviewScreen() {
  const [set, setSet] = useState(PREVIEW_SETS[0]?.key ?? '');
  if (!designPickerEnabled) return <Redirect href="/" />;
  const current = PREVIEW_SETS.find((s) => s.key === set) ?? PREVIEW_SETS[0];
  return (
    <Screen>
      <ScreenHeader title={tr.design.previewTitle} onBack={() => router.back()} />
      <View className="mt-3 gap-4" testID={`preview-${current?.key ?? ''}`}>
        {PREVIEW_SETS.length > 1 ? (
          // Wrapped: five sets don't fit a segmented control at 320 dp.
          <View className="flex-row flex-wrap gap-2">
            {PREVIEW_SETS.map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant={s.key === set ? 'primary' : 'neutral'}
                label={s.label}
                testID={`preview-set-${s.key}`}
                onPress={() => setSet(s.key)}
              />
            ))}
          </View>
        ) : null}
        {current?.render()}
      </View>
    </Screen>
  );
}
