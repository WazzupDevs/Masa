import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

import { type IconName } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

// Seconds at which the clock turns urgent (canvas: Aşama 6 · Oyunlar → Geri bildirim).
export const URGENT_SECONDS = 10;
const PULSE_MS = 500;
const BUMP_MS = 160;
const FLOAT_MS = 900;

// The turn clock pill ("0:37"). In the last 10 seconds it turns to the danger colour, grows and
// pulses; with reduce motion it only changes colour and size.
export function ClockPill({ seconds }: { seconds: number }) {
  const { colors, shape } = useTheme();
  const reduce = useReduceMotion();
  const urgent = seconds > 0 && seconds <= URGENT_SECONDS;
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!urgent || reduce) {
      scale.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [urgent, reduce, scale]);

  const fg = urgent ? colors.onDanger : colors.text;
  return (
    <Animated.View
      testID={urgent ? 'game-clock-urgent' : 'game-clock'}
      accessibilityRole="timer"
      accessibilityLabel={tr.games.clockLabel(seconds)}
      className="flex-row items-center gap-1.5"
      style={{
        minHeight: urgent ? TOUCH.min + SPACING[1] : TOUCH.min - SPACING[2],
        paddingHorizontal: urgent ? SPACING[4] : SPACING[3],
        borderRadius: shape.radius.pill,
        backgroundColor: urgent ? colors.danger : colors.surface2,
        borderWidth: urgent || shape.stroke.control > 1 ? Math.max(shape.stroke.control, 2) : 0,
        borderColor: colors.border,
        transform: [{ scale }],
      }}
    >
      <Ionicons name="time-outline" size={urgent ? ICON.md : ICON.sm} color={fg} />
      <Text variant={urgent ? 'title' : 'bodyStrong'} color={fg} tabular>
        {tr.games.clock(seconds)}
      </Text>
    </Animated.View>
  );
}

// A team's score. The describing team is ringed in the accent, or filled like a sticker when the
// theme's `selectedTeam` is `fill`. When the score changes the number grows for a moment and the
// change ("+1", "−1") floats up beside it; with reduce motion the number just changes.
export function TeamScore({
  name,
  note,
  score,
  active,
}: {
  name: string;
  note: string;
  score: number;
  active: boolean;
}) {
  const { colors, shape } = useTheme();
  const reduce = useReduceMotion();
  const fill = active && shape.selectedTeam === 'fill';
  const fg = fill ? colors.onBuzz : colors.text;
  const [bump] = useState(() => new Animated.Value(0));
  const [float] = useState(() => new Animated.Value(1));
  const [delta, setDelta] = useState(0);
  const last = useRef(score);

  useEffect(() => {
    const change = score - last.current;
    last.current = score;
    if (change === 0 || reduce) return;
    setDelta(change);
    bump.setValue(0);
    float.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(bump, { toValue: 1, duration: BUMP_MS, useNativeDriver: true }),
        Animated.timing(bump, { toValue: 0, duration: BUMP_MS * 2, useNativeDriver: true }),
      ]),
      Animated.timing(float, { toValue: 1, duration: FLOAT_MS, useNativeDriver: true }),
    ]).start();
  }, [score, reduce, bump, float]);

  return (
    <View
      className="flex-1 gap-0.5"
      style={{
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2.5],
        borderRadius: shape.radius.md,
        backgroundColor: fill ? colors.buzz : colors.surface,
        borderWidth:
          active && !fill ? Math.max(shape.stroke.control, 2) : Math.max(shape.stroke.card, 1),
        borderColor: active && !fill ? colors.accent : colors.border,
        boxShadow: shape.shadow.card,
      }}
    >
      <Text variant="label" color={fg} numberOfLines={1}>
        {name}
      </Text>
      <Text variant="fine" color={fill ? colors.onBuzz : colors.muted}>
        {note}
      </Text>
      <View className="flex-row items-end gap-2">
        <Animated.View
          style={{
            transform: [
              { scale: bump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) },
            ],
          }}
        >
          <Text variant="score" color={fg}>
            {String(score)}
          </Text>
        </Animated.View>
        {delta !== 0 ? (
          <Animated.View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={{
              opacity: float.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
              transform: [
                {
                  translateY: float.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -SPACING[5]],
                  }),
                },
              ],
            }}
          >
            <Text variant="bodyStrong" color={fg}>
              {delta > 0 ? tr.games.scoreUp(delta) : tr.games.scoreDown(-delta)}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

// "Hakem sizsiniz …": the role note above the card.
export function RoleNote({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <Card tone="note">
      <View className="flex-row items-start gap-2">
        <Ionicons name={icon} size={ICON.md} color={colors.text} />
        <Text className="flex-1">{text}</Text>
      </View>
    </Card>
  );
}
