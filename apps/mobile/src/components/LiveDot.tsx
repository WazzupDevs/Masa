import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useReduceMotion } from '@/lib/useReduceMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { type PaletteKey, SPACING } from '@/theme/tokens';

import { HALO_IMAGE } from './Glyph';

type Props = {
  tone: PaletteKey;
  // One beat: grow and shrink back. Livelier things beat faster.
  periodMs: number;
  size?: number;
  // What the dot says ("Çok hareketli"); without it the dot is decoration.
  accessibilityLabel?: string;
};

const GROW = 1.35;

// A dot that beats like something alive (canvas: Aşama 8 · Saha → Mekan, Keşfet): it grows and
// shrinks, a blurred halo of its colour breathing around it (a tinted PNG: no native blur). Still
// under reduce motion, half-way through the beat.
export function LiveDot({ tone, periodMs, size = SPACING[3], accessibilityLabel }: Props) {
  const { colors, shape } = useTheme();
  const reduce = useReduceMotion();
  const [beat] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    if (reduce) {
      beat.setValue(0.5);
      return undefined;
    }
    const half = periodMs / 2;
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: half, easing: ease, useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: half, easing: ease, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, periodMs, beat]);

  const box = size * 3;
  const color = colors[tone];
  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.Image
        source={HALO_IMAGE}
        accessible={false}
        resizeMode="contain"
        style={{
          position: 'absolute',
          width: box,
          height: box,
          tintColor: color,
          opacity: beat.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }),
          transform: [
            { scale: beat.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] }) },
          ],
        }}
      />
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: shape.radius.pill,
          backgroundColor: color,
          transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, GROW] }) }],
        }}
      />
    </View>
  );
}
