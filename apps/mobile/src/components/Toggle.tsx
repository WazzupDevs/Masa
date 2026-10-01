import { Pressable, View } from 'react-native';

import { switchColors } from '@/theme/switch';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

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

// The canvas switch: a 52 × 32 outlined track and an outlined thumb (`switchColors`).
const TRACK = { width: SPACING[12] + SPACING[1], height: SPACING[8] } as const;
const THUMB = SPACING[5] + SPACING[0.5];

// A labelled on/off switch (canvas: "Profilimle yaz"). The whole row toggles, so the label is as
// good a target as the switch; screen readers hear one switch.
export function Toggle({ label, value, onChange, hint, disabled, testID }: Props) {
  const { colors, shape } = useTheme();
  const c = switchColors(colors, value);
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
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          width: TRACK.width,
          height: TRACK.height,
          borderRadius: shape.radius.pill,
          borderWidth: shape.stroke.control,
          borderColor: c.trackBorder,
          backgroundColor: c.track,
          paddingHorizontal: SPACING[0.5],
          justifyContent: 'center',
          alignItems: value ? 'flex-end' : 'flex-start',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <View
          style={{
            width: THUMB,
            height: THUMB,
            borderRadius: shape.radius.pill,
            borderWidth: shape.stroke.control,
            borderColor: c.thumbBorder,
            backgroundColor: c.thumb,
          }}
        />
      </View>
    </Pressable>
  );
}
