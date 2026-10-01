import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

import { usePressScale } from './motion';
import { useQuiet } from './Quiet';

type Props = {
  children: ReactNode;
  // `card`: soft, no outline. `feature`: the one featured card per screen, with the outline and
  // the hard shadow. `note`: a quiet surface2 block (role hint, pending request, notices).
  tone?: 'card' | 'feature' | 'note';
  // Content that runs to the card's edges (a colour block on top); the card clips it.
  flush?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  className?: string; // layout only (margins, gap, alignment)
  testID?: string;
};

// A card drawn from the theme's tokens. On trust screens (`Quiet`) a hairline in the divider colour
// and no shadow.
export function Card({
  children,
  tone = 'card',
  flush,
  onPress,
  accessibilityLabel,
  className,
  testID,
}: Props) {
  const { colors, shape } = useTheme();
  const quiet = useQuiet();
  const pressScale = usePressScale();

  const feature = tone === 'feature' && !quiet;
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
          borderRadius: feature ? shape.radius.lg + SPACING[1] : shape.radius.lg,
          padding: flush ? 0 : SPACING[4],
          overflow: flush ? 'hidden' : undefined,
          borderWidth: quiet ? shape.stroke.hairline : feature ? shape.stroke.feature : 0,
          borderColor: quiet ? colors.divider : colors.border,
          boxShadow: quiet ? undefined : feature ? shape.shadow.feature : shape.shadow.card,
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
          {({ pressed }) => <View style={[style, pressScale(pressed)]}>{children}</View>}
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
