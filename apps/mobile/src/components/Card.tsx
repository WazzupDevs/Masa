import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

import { useQuiet } from './Quiet';

type Props = {
  children: ReactNode;
  // `note`: a quiet surface2 block (role hint, pending request, notices), no outline or shadow.
  tone?: 'card' | 'note';
  onPress?: () => void;
  accessibilityLabel?: string;
  className?: string; // layout only (margins, gap, alignment)
};

// A card in the direction's language: Gece Kafe floats on a soft shadow, Oyun Gecesi has an
// outline and a hard shadow, Sakin Liman a hairline. On trust screens (`Quiet`) every direction
// uses the hairline.
export function Card({ children, tone = 'card', onPress, accessibilityLabel, className }: Props) {
  const { colors, shape } = useTheme();
  const quiet = useQuiet();

  const style: ViewStyle =
    tone === 'note'
      ? {
          backgroundColor: colors.surface2,
          borderRadius: shape.radius.md,
          paddingHorizontal: SPACING[3],
          paddingVertical: SPACING[2.5],
        }
      : {
          backgroundColor: colors.surface,
          borderRadius: shape.radius.lg,
          padding: SPACING[4],
          borderWidth: quiet ? shape.stroke.hairline : shape.stroke.card,
          borderColor: quiet ? colors.divider : colors.border,
          boxShadow: quiet ? undefined : shape.shadow.card,
        };

  if (onPress) {
    return (
      <View className={className}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={({ pressed }) => [style, pressed ? { opacity: 0.85 } : null]}
        >
          {children}
        </Pressable>
      </View>
    );
  }
  return (
    <View className={className} style={style}>
      {children}
    </View>
  );
}
