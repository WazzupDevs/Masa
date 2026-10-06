import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Segmented } from '@/components/Segmented';
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
          <Segmented
            accessibilityLabel={tr.design.previewTitle}
            value={set}
            onChange={setSet}
            options={PREVIEW_SETS.map((s) => ({
              value: s.key,
              label: s.label,
              testID: `preview-set-${s.key}`,
            }))}
          />
        ) : null}
        {current?.render()}
      </View>
    </Screen>
  );
}
