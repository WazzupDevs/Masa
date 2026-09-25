import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { Text } from './Text';

type Props = { label: string; checked: boolean; onToggle: () => void };

export function Checkbox({ label, checked, onToggle }: Props) {
  const { colors, shape } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING[3],
        minHeight: TOUCH.button,
      }}
    >
      <View
        className="items-center justify-center"
        style={{
          width: SPACING[6],
          height: SPACING[6],
          borderRadius: shape.radius.sm / 2,
          borderWidth: Math.max(shape.stroke.control, 2),
          borderColor: checked ? colors.accent : colors.muted,
          backgroundColor: checked ? colors.accent : 'transparent',
        }}
      >
        {checked ? <Ionicons name="checkmark" size={ICON.sm} color={colors.onAccent} /> : null}
      </View>
      <Text className="flex-1">{label}</Text>
    </Pressable>
  );
}
