import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { SCHEME_PREFERENCES } from '@/theme/registry';
import { THEME } from '@/theme/theme';
import {
  designPickerEnabled,
  setSchemePreference,
  useSchemePreference,
} from '@/theme/ThemeProvider';

// Ayarlar → Tasarım (test): light / dark / system, stored on the device. Preview builds and
// development only; production never renders it and uses the theme's default scheme.
export function DesignPicker() {
  const preference = useSchemePreference();
  if (!designPickerEnabled) return null;
  const scheme = preference ?? THEME.defaultScheme;

  return (
    <View className="gap-2">
      <Text variant="heading" accessibilityRole="header">
        {tr.design.title}
      </Text>
      <Text variant="fine">{tr.design.hint}</Text>
      <Text variant="label" className="mt-2">
        {tr.design.schemeLabel}
      </Text>
      <Segmented
        accessibilityLabel={tr.design.schemeLabel}
        value={scheme}
        onChange={(value) => setSchemePreference(value)}
        options={SCHEME_PREFERENCES.map((value) => ({
          value,
          label: tr.design.schemes[value],
          testID: `design-scheme-${value}`,
        }))}
      />
      <View className="mt-2">
        <Button
          variant="secondary"
          testID="preview-open"
          label={tr.design.previewOpen}
          onPress={() => router.push('/design-preview')}
        />
      </View>
    </View>
  );
}
