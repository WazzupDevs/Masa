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
};

const DOT = SPACING[5];

// One option of a single choice: a card with a radio mark; selected draws the accent ring.
export function Choice({ label, hint, selected, onPress, disabled }: Props) {
  const { colors, shape } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING[3],
        minHeight: TOUCH.tab,
        paddingHorizontal: SPACING[4],
        paddingVertical: SPACING[3],
        borderRadius: shape.radius.md,
        backgroundColor: colors.surface,
        borderWidth: selected ? Math.max(shape.stroke.control, 2) : shape.stroke.control,
        borderColor: selected ? colors.accent : colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View className="flex-1 gap-1">
        <Text variant="bodyStrong">{label}</Text>
        {hint ? <Text variant="fine">{hint}</Text> : null}
      </View>
      <View
        className="items-center justify-center"
        style={{
          width: DOT,
          height: DOT,
          borderRadius: shape.radius.pill,
          borderWidth: 2,
          borderColor: selected ? colors.accent : colors.muted,
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
    </Pressable>
  );
}
