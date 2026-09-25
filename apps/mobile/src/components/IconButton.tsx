import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, TOUCH } from '@/theme/tokens';

import type { IconName } from './Button';

type Props = { icon: IconName; label: string; onPress: () => void };

// A 44 × 44 icon-only button; the label is for screen readers.
export function IconButton({ icon, label, onPress }: Props) {
  const { colors, shape } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: TOUCH.min,
        height: TOUCH.min,
        borderRadius: shape.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surface2 : 'transparent',
      })}
    >
      <Ionicons name={icon} size={ICON.lg} color={colors.text} />
    </Pressable>
  );
}
