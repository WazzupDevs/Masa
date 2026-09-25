import { View } from 'react-native';

import { Choice } from '@/components/Choice';
import { Segmented } from '@/components/Segmented';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { SCHEME_PREFERENCES, THEME_NAMES, THEMES } from '@/theme/registry';
import {
  designPickerEnabled,
  setDesignPreference,
  useDesignPreference,
} from '@/theme/ThemeProvider';

// Ayarlar → Tasarım (test): the three directions and light / dark / system, stored on the device.
// Preview builds and development only; production never renders it and runs DEFAULT_THEME.
export function DesignPicker() {
  const preference = useDesignPreference();
  if (!designPickerEnabled) return null;
  const scheme = preference.scheme ?? THEMES[preference.theme].defaultScheme;

  return (
    <View className="gap-2">
      <Text variant="heading" accessibilityRole="header">
        {tr.design.title}
      </Text>
      <Text variant="fine">{tr.design.hint}</Text>
      <View accessibilityRole="radiogroup" className="gap-2">
        {THEME_NAMES.map((name) => (
          <Choice
            key={name}
            label={tr.design.themes[name]}
            hint={tr.design.themeHints[name]}
            selected={preference.theme === name}
            onPress={() => setDesignPreference({ theme: name })}
          />
        ))}
      </View>
      <Text variant="label" className="mt-2">
        {tr.design.schemeLabel}
      </Text>
      <Segmented
        accessibilityLabel={tr.design.schemeLabel}
        value={scheme}
        onChange={(value) => setDesignPreference({ scheme: value })}
        options={SCHEME_PREFERENCES.map((value) => ({ value, label: tr.design.schemes[value] }))}
      />
      {scheme === 'system' ? <Text variant="fine">{tr.design.systemNote}</Text> : null}
    </View>
  );
}
