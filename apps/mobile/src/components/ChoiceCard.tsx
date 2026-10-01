import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

import { usePressScale } from './motion';
import { Text } from './Text';

type Props = {
  label: string;
  hint?: string;
  // A big picture over the label (the table's snail, the profile).
  picture: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
};

// One of two side-by-side choices with a picture (canvas: Oda kur → nasıl görüneceksiniz?): a soft
// card, the chosen one ringed in the accent.
export function ChoiceCard({ label, hint, picture, selected, disabled, onPress, testID }: Props) {
  const { colors, shape } = useTheme();
  const pressScale = usePressScale();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className="flex-1"
    >
      {({ pressed }) => (
        <View
          className="items-center gap-2.5"
          style={[
            {
              paddingHorizontal: SPACING[3],
              paddingVertical: SPACING[3],
              borderRadius: shape.radius.lg,
              backgroundColor: colors.surface,
              borderWidth: shape.stroke.feature + 1,
              borderColor: selected ? colors.accent : 'transparent',
              boxShadow: shape.shadow.card,
              opacity: disabled ? 0.5 : 1,
            },
            pressScale(pressed),
          ]}
        >
          {picture}
          <Text variant="bodyStrong" align="center">
            {label}
          </Text>
          {hint ? (
            <Text variant="fine" align="center">
              {hint}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
