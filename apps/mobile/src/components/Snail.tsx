import { useEffect, useState } from 'react';
import { Animated, Easing, Image, View } from 'react-native';

import { tr } from '@/i18n/tr';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

import { Text } from './Text';

// The brand snail as images drawn by `pnpm icons` (scripts/icon/snail.ts): react-native-svg is not
// in the app and would be a new native module. Its box: 103 × 92 units (`box()`), so the width is
// height × ASPECT; the antennae turn about the top of the head.
export const SNAIL_ASPECT = 103 / 92;
const ANTENNA_PIVOT = '75.2% 31.5%';

const IMAGES = {
  light: require('../../assets/brand/snail-light.png'),
  dark: require('../../assets/brand/snail-dark.png'),
  small: require('../../assets/brand/snail-small.png'),
  tab: require('../../assets/brand/tab-snail.png'),
};
const CRAWL = {
  light: {
    body: require('../../assets/brand/crawl-body-light.png'),
    shell: require('../../assets/brand/crawl-shell-light.png'),
    antennae: require('../../assets/brand/crawl-antennae-light.png'),
  },
  dark: {
    body: require('../../assets/brand/crawl-body-dark.png'),
    shell: require('../../assets/brand/crawl-shell-dark.png'),
    antennae: require('../../assets/brand/crawl-antennae-dark.png'),
  },
};

type Props = {
  height: number;
  // `small`: no face, always ink-outlined (avatars, the selected Mekan tab); `full`: the mascot in
  // the scheme's outline; `ink`: the mascot ink-outlined in both schemes, on a light colour block.
  variant?: 'full' | 'small' | 'ink';
};

// The snail, still. Decorative: screens say what it means in text.
export function Snail({ height, variant = 'full' }: Props) {
  const { scheme } = useTheme();
  const source =
    variant === 'small' ? IMAGES.small : variant === 'ink' ? IMAGES.light : IMAGES[scheme];
  return (
    <Image
      source={source}
      accessible={false}
      style={{ height, width: height * SNAIL_ASPECT }}
      resizeMode="contain"
    />
  );
}

// The app's name beside the snail, at the top of the phone screen (canvas: Telefon numaran).
export function BrandLine() {
  return (
    <View className="flex-row items-center" style={{ gap: SPACING[2.5] }}>
      <Snail height={SPACING[8]} />
      <Text variant="title">{tr.app.name}</Text>
    </View>
  );
}

// The Mekan tab's line icon, tinted like the other tab icons.
export function SnailLineIcon({ size, color }: { size: number; color: string }) {
  return (
    <Image
      source={IMAGES.tab}
      accessible={false}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}

// A loop of 1200 ms: the foot stretches forward and gathers, the shell follows 120 ms later, the
// antennae sway. Transform and opacity only, on the native driver. Reduce motion: a still snail.
const CRAWL_MS = 1200;
const SHOW_AFTER_MS = 400;

type LoaderProps = {
  // 72 in screens, 28 inline.
  height?: number;
  // Shows "Yükleniyor…" under it.
  label?: boolean;
};

// The loading state (canvas: Sürünme animasyonu). Appears only if loading takes over 400 ms, so a
// quick load does not flash.
export function SnailLoader({ height = SPACING[16] + SPACING[2], label = true }: LoaderProps) {
  const { scheme } = useTheme();
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(false);
  const [t] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!shown || reduce) return;
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: CRAWL_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shown, reduce, t]);

  const unit = height / 92;
  const foot = t.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1.07, 1] });
  const shellX = t.interpolate({
    inputRange: [0, 0.2, 0.55, 0.8, 1],
    outputRange: [0, 0, 4 * unit, 4 * unit, 0],
  });
  const shellY = t.interpolate({
    inputRange: [0, 0.2, 0.55, 0.8, 1],
    outputRange: [0, 0, -2 * unit, 0, 0],
  });
  const sway = t.interpolate({
    inputRange: [0, 0.3, 0.65, 1],
    outputRange: ['0deg', '-7deg', '5deg', '0deg'],
  });

  const layers = CRAWL[scheme];
  const frame = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    height,
    width: height * SNAIL_ASPECT,
  };

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={tr.common.loading}
      className="items-center"
      style={{ gap: SPACING[3], opacity: shown ? 1 : 0 }}
    >
      <View style={{ height, width: height * SNAIL_ASPECT }}>
        <Animated.Image
          source={layers.body}
          style={[frame, { transformOrigin: 'left bottom', transform: [{ scaleX: foot }] }]}
        />
        <Animated.Image
          source={layers.antennae}
          style={[frame, { transformOrigin: ANTENNA_PIVOT, transform: [{ rotate: sway }] }]}
        />
        <Animated.Image
          source={layers.shell}
          style={[frame, { transform: [{ translateX: shellX }, { translateY: shellY }] }]}
        />
      </View>
      {label ? (
        <Text variant="fine" tone="muted">
          {tr.common.loading}
        </Text>
      ) : null}
    </View>
  );
}
