import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { withAlpha } from '@/theme/contrast';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

const SCRIM_OPACITY = 0.55;

type Props = {
  visible: boolean;
  // Under the title: "Yaratıcı Lokma bu turda +5".
  detail?: string;
  // The game's name for the corner mark of a screen recording ("Kabuk · Sesli Tabu").
  brand?: string;
};

// "Süre bitti!" over the game when a turn's time runs out (canvas: Aşama 6 · Oyunlar → Süre bitti):
// big and centred so it reads in a screen recording. It pops in once; with reduce motion it is
// simply there. The parent decides how long it stays (about 1.5 s) and what follows.
export function TimeUpOverlay({ visible, detail, brand }: Props) {
  const { colors, shape } = useTheme();
  const reduce = useReduceMotion();
  const [pop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      return;
    }
    if (reduce) {
      pop.setValue(1);
      return;
    }
    Animated.spring(pop, {
      toValue: 1,
      useNativeDriver: true,
      damping: 12,
      stiffness: 180,
    }).start();
  }, [visible, reduce, pop]);

  if (!visible) return null;
  return (
    <View
      testID="time-up"
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      className="absolute inset-0 items-center justify-center"
      style={{ backgroundColor: withAlpha(colors.scrim, SCRIM_OPACITY), padding: SPACING[6] }}
    >
      <Animated.View
        className="w-full items-center gap-2"
        style={{
          paddingHorizontal: SPACING[5],
          paddingVertical: SPACING[8],
          borderRadius: shape.radius.lg + SPACING[3],
          backgroundColor: colors.danger,
          borderWidth: Math.max(shape.stroke.feature, 2),
          borderColor: colors.border,
          boxShadow: shape.shadow.feature ?? undefined,
          opacity: pop,
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
        }}
      >
        <Text variant="hero" tone="onDanger" align="center">
          {tr.games.timeUp}
        </Text>
        {detail ? (
          <Text variant="title" tone="onDanger" align="center">
            {detail}
          </Text>
        ) : null}
        {brand ? (
          <Text variant="label" tone="onDanger" align="center" className="mt-2">
            {brand}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}
