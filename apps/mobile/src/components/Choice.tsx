import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { Text } from './Text';

type Props = {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

const DOT = SPACING[6];

// One option of a single choice (canvas: Bileşenler): a card with the radio mark first; the
// selected one fills with the quiet colour and lifts on the theme's hard shadow.
export function Choice({ label, hint, selected, onPress, disabled, testID }: Props) {
  const { colors, shape } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      testID={testID}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: hint ? 'flex-start' : 'center',
        gap: SPACING[3],
        minHeight: TOUCH.tab,
        paddingHorizontal: SPACING[4],
        paddingVertical: SPACING[3] + SPACING[0.5],
        borderRadius: shape.radius.md,
        backgroundColor: selected ? colors.surface2 : colors.surface,
        borderWidth: Math.max(shape.stroke.control, 1),
        borderColor: colors.border,
        boxShadow: selected ? shape.shadow.raised : undefined,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View
        className="items-center justify-center"
        style={{
          width: DOT,
          height: DOT,
          borderRadius: shape.radius.pill,
          borderWidth: 2,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        {selected ? (
          <View
            style={{
              width: DOT / 2,
              height: DOT / 2,
              borderRadius: shape.radius.pill,
              backgroundColor: colors.accent,
            }}
          />
        ) : null}
      </View>
      <View className="flex-1 gap-1">
        <Text variant="bodyStrong">{label}</Text>
        {hint ? <Text variant="fine">{hint}</Text> : null}
      </View>
    </Pressable>
  );
}
