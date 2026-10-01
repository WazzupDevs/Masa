import { Pressable, Switch, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';

import { Text } from './Text';

type Props = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  // A line under the label that says what the choice does.
  hint?: string;
  disabled?: boolean;
  testID?: string;
};

// A labelled on/off switch (canvas: "Profilimle yaz"). The whole row toggles, so the label is as
// good a target as the switch; screen readers hear one switch.
export function Toggle({ label, value, onChange, hint, disabled, testID }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      className="flex-row items-center gap-3"
      style={{ minHeight: TOUCH.min }}
    >
      <View className="flex-1">
        <Text variant="bodyStrong">{label}</Text>
        {hint ? <Text variant="fine">{hint}</Text> : null}
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ false: colors.surface2, true: colors.accent }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.surface2}
        />
      </View>
    </Pressable>
  );
}
