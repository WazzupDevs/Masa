import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { tr } from '@/i18n/tr';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { Text } from './Text';

type Props = {
  text: string;
  // The viewer's own message: right, accent. Otherwise left, surface, with the sender.
  mine: boolean;
  // Left messages: the sender's avatar, name and an optional tag ("profilli").
  avatar?: ReactNode;
  name?: string;
  tag?: ReactNode;
  // Opens the sender's profile card (profiled senders only).
  onPressSender?: () => void;
  // Own messages still on the way, or refused by the network.
  state?: 'sending' | 'failed';
  // Why a failed message was refused, when the server said ("Çok hızlı yazıyorsun.").
  failedText?: string;
  onRetry?: () => void;
  onDiscard?: () => void;
  // A run of messages from one sender (canvas: Aşama 4 · Yenileme): the name over the first, the
  // avatar and the time beside and under the last, tight corners inside the run. A lone message is
  // both first and last.
  first?: boolean;
  last?: boolean;
  time?: string;
  // Own DM messages (canvas: Aşama 5 · Geri bildirim → DM): one tick sent, two delivered, two in
  // the read colour read. Shown next to the time.
  delivery?: Delivery;
  testID?: string;
};

export type Delivery = 'sent' | 'delivered' | 'read';

// One chat message: the other side left with an avatar, the viewer right in the accent colour; the
// corners on the speaker's side are small inside a run.
export function ChatBubble({
  text,
  mine,
  avatar,
  name,
  tag,
  onPressSender,
  state,
  failedText,
  onRetry,
  onDiscard,
  first = true,
  last = true,
  time,
  delivery,
  testID,
}: Props) {
  const { colors, shape } = useTheme();
  const big = shape.radius.lg - SPACING[1];
  const small = SPACING[1.5];
  const top = first ? big : small;
  const bubble = (
    <View
      testID={testID}
      style={{
        maxWidth: '100%',
        paddingHorizontal: SPACING[3] + SPACING[0.5],
        paddingVertical: SPACING[2],
        borderTopLeftRadius: mine ? big : top,
        borderTopRightRadius: mine ? top : big,
        borderBottomLeftRadius: mine ? big : small,
        borderBottomRightRadius: mine ? small : big,
        backgroundColor: mine ? colors.accent : colors.raised,
        opacity: state === 'sending' ? 0.6 : 1,
        boxShadow: mine ? undefined : shape.shadow.raised,
      }}
    >
      <Text tone={mine ? 'onAccent' : 'text'}>{text}</Text>
    </View>
  );
  const stamp =
    time && last && !state ? (
      <View className="flex-row items-center gap-1" style={{ paddingHorizontal: SPACING[1.5] }}>
        <Text variant="fine">{time}</Text>
        {mine && delivery ? <DeliveryTicks delivery={delivery} /> : null}
      </View>
    ) : null;

  if (mine) {
    return (
      <View className="items-end gap-1 self-end" style={{ maxWidth: '82%' }}>
        {bubble}
        {stamp}
        {state ? (
          <View className="flex-row items-center gap-3">
            <Text variant="fine" tone={state === 'failed' ? 'danger' : 'muted'}>
              {state === 'failed' ? (failedText ?? tr.chat.notSent) : tr.chat.sending}
            </Text>
            {state === 'failed' && onRetry ? (
              <Pressable
                accessibilityRole="button"
                onPress={onRetry}
                style={{ minHeight: TOUCH.min, justifyContent: 'center' }}
              >
                <Text variant="label" tone="accent">
                  {tr.chat.retry}
                </Text>
              </Pressable>
            ) : null}
            {state === 'failed' && onDiscard ? (
              <Pressable
                accessibilityRole="button"
                onPress={onDiscard}
                style={{ minHeight: TOUCH.min, justifyContent: 'center' }}
              >
                <Text variant="label" tone="muted">
                  {tr.chat.discard}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  const head =
    first && (name || tag) ? (
      <View className="flex-row items-center gap-1.5" style={{ paddingLeft: SPACING[1] }}>
        {name ? (
          <Text variant="label" tone="muted">
            {name}
          </Text>
        ) : null}
        {tag}
      </View>
    ) : null;
  const content = (
    <View className="items-start gap-1">
      {head}
      {bubble}
      {stamp}
    </View>
  );
  // Inside a run the avatar keeps its place, invisible, so the bubbles line up.
  const face = avatar ? (
    <View
      style={{ paddingBottom: stamp ? SPACING[5] : 0, opacity: last ? 1 : 0 }}
      importantForAccessibility={last ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!last}
    >
      {avatar}
    </View>
  ) : null;
  const row = (
    <View className="flex-row items-end gap-2">
      {face}
      <View className="shrink">{content}</View>
    </View>
  );
  // The avatar, the name and the bubble are one target: they all open the sender's profile.
  return (
    <View className="self-start" style={{ maxWidth: '88%' }}>
      {onPressSender ? (
        <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onPressSender}>
          {row}
        </Pressable>
      ) : (
        row
      )}
    </View>
  );
}

// Also on a Mesajlar row, before the preview of the viewer's own last message.
export function DeliveryTicks({ delivery }: { delivery: Delivery }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={tr.dm.delivery[delivery]} testID={`tick-${delivery}`}>
      <Ionicons
        name={delivery === 'sent' ? 'checkmark' : 'checkmark-done'}
        size={ICON.sm}
        color={delivery === 'read' ? colors.read : colors.muted}
      />
    </View>
  );
}

const DOT = SPACING[2];
const TYPING_MS = 400;

// The other side is typing: three dots in a left bubble, rising in turn; still under reduce motion.
export function TypingBubble({ avatar, testID }: { avatar?: ReactNode; testID?: string }) {
  const { colors, shape } = useTheme();
  const reduce = useReduceMotion();
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));

  useEffect(() => {
    if (reduce) {
      dots.forEach((d) => d.setValue(0));
      return undefined;
    }
    const loop = Animated.loop(
      Animated.stagger(
        TYPING_MS / 3,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, { toValue: 1, duration: TYPING_MS / 2, useNativeDriver: true }),
            Animated.timing(d, { toValue: 0, duration: TYPING_MS / 2, useNativeDriver: true }),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, dots]);

  const big = shape.radius.lg - SPACING[1];
  return (
    <View
      className="flex-row items-end gap-2 self-start"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={tr.dm.typing}
      testID={testID}
    >
      {avatar}
      <View
        className="flex-row items-center"
        style={{
          gap: SPACING[1],
          paddingHorizontal: SPACING[3] + SPACING[0.5],
          paddingVertical: SPACING[3],
          borderTopLeftRadius: big,
          borderTopRightRadius: big,
          borderBottomRightRadius: big,
          borderBottomLeftRadius: SPACING[1.5],
          backgroundColor: colors.raised,
          boxShadow: shape.shadow.raised,
        }}
      >
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={{
              width: DOT,
              height: DOT,
              borderRadius: shape.radius.pill,
              backgroundColor: colors.muted,
              opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
              transform: [
                {
                  translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -SPACING[1]] }),
                },
              ],
            }}
          />
        ))}
      </View>
    </View>
  );
}
