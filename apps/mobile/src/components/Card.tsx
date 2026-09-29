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
  testID?: string;
};

// A card drawn from the theme's tokens: its outline (`stroke.card`) and shadow (`shadow.card`).
// On trust screens (`Quiet`) a hairline in the divider colour and no shadow.
export function Card({
  children,
  tone = 'card',
  onPress,
  accessibilityLabel,
  className,
  testID,
}: Props) {
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
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
        >
          {({ pressed }) => (
            <View style={[style, pressed ? { opacity: 0.85 } : null]}>{children}</View>
          )}
        </Pressable>
      </View>
    );
  }
  return (
    <View className={className} style={style} testID={testID}>
      {children}
    </View>
  );
}
