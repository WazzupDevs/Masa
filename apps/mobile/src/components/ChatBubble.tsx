import { Ionicons } from '@expo/vector-icons';
import { REACTIONS, type Reaction } from '@shared/reactions.ts';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { tr } from '@/i18n/tr';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { withAlpha } from '@/theme/contrast';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { AVATAR_SIZE } from './Avatar';
import { useDepth } from './Depth';
import { Text } from './Text';

export type ChatQuote = { name: string; text: string };
export type ChatReaction = { emoji: string; count: number; mine: boolean };

type Props = {
  text: string;
  // The viewer's own message: right, accent. Otherwise left, surface, with the sender.
  mine: boolean;
  // Left messages: the sender's avatar (32), name and an optional tag ("profilli"), on one line
  // over the sender's run.
  avatar?: ReactNode;
  name?: string;
  tag?: ReactNode;
  // Opens the sender's profile from the photo and the name (profiled senders only).
  onPressSender?: () => void;
  // Own messages still on the way, or refused by the network.
  state?: 'sending' | 'failed';
  // Why a failed message was refused, when the server said ("Çok hızlı yazıyorsun.").
  failedText?: string;
  onRetry?: () => void;
  onDiscard?: () => void;
  // A run of messages from one sender: the photo and the name over the first, the time under the
  // last, tight corners inside the run. A lone message is both first and last.
  first?: boolean;
  last?: boolean;
  time?: string;
  // Own DM messages (canvas: Aşama 5 · Geri bildirim → DM): one tick sent, two delivered, two in
  // the read colour read. Shown next to the time.
  delivery?: Delivery;
  // Aşama 8 · Saha (the data comes later): the message this one answers, shown inside the bubble;
  // the reactions under it; a swipe to the right to answer it; a long press for the six reactions.
  quote?: ChatQuote;
  reactions?: readonly ChatReaction[];
  onToggleReaction?: (emoji: string) => void;
  onReply?: () => void;
  onReact?: (emoji: Reaction) => void;
  testID?: string;
};

export type Delivery = 'sent' | 'delivered' | 'read';

// The others' messages sit under the photo's column.
const INDENT = AVATAR_SIZE.sm + SPACING[2];
// Swipe to reply: past TRIGGER the message is answered; it never moves further than MAX.
const SWIPE_SLOP = SPACING[3];
const SWIPE_TRIGGER = SPACING[14];
const SWIPE_MAX = SPACING[16] + SPACING[4];

// One chat message, WhatsApp-like (canvas: Aşama 8 · Saha → Sohbet): the others' runs open with
// the sender's photo and name on one line and the bubbles under them; the viewer's own are right,
// in the accent colour.
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
  quote,
  reactions,
  onToggleReaction,
  onReply,
  onReact,
  testID,
}: Props) {
  const { colors, shape } = useTheme();
  const [picking, setPicking] = useState(false);
  const big = shape.radius.lg - SPACING[1];
  const small = SPACING[1.5];
  const top = first ? big : small;
  const fg = mine ? colors.onAccent : colors.text;
  const bubble = (
    <Pressable
      testID={testID}
      accessibilityLabel={quote ? `${tr.chat.quoteLabel(quote.name, quote.text)}. ${text}` : text}
      accessibilityActions={[
        ...(onReply ? [{ name: 'reply', label: tr.chat.reply }] : []),
        ...(onReact ? [{ name: 'react', label: tr.chat.react }] : []),
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'reply') onReply?.();
        if (e.nativeEvent.actionName === 'react') setPicking(true);
      }}
      onLongPress={onReact ? () => setPicking((p) => !p) : undefined}
      style={{ maxWidth: '100%' }}
    >
      <View
        style={{
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
        {quote ? <QuoteBlock quote={quote} mine={mine} /> : null}
        <Text color={fg}>{text}</Text>
      </View>
    </Pressable>
  );
  const stamp =
    time && last && !state ? (
      <View className="flex-row items-center gap-1" style={{ paddingHorizontal: SPACING[1.5] }}>
        <Text variant="fine">{time}</Text>
        {mine && delivery ? <DeliveryTicks delivery={delivery} /> : null}
      </View>
    ) : null;
  const chips =
    reactions && reactions.length > 0 ? (
      <ReactionChips reactions={reactions} onToggle={onToggleReaction} mine={mine} />
    ) : null;
  const bar =
    picking && onReact ? (
      <ReactionBar
        onPick={(emoji) => {
          setPicking(false);
          onReact(emoji);
        }}
      />
    ) : null;

  if (mine) {
    return (
      <View className="items-end gap-1 self-end" style={{ maxWidth: '82%' }}>
        {bar}
        <SwipeToReply onReply={onReply}>{bubble}</SwipeToReply>
        {chips}
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

  // The run's head: the photo and the name on one line; both open the profile when there is one.
  const headRow =
    first && (avatar || name || tag) ? (
      <View className="flex-row items-center gap-2">
        {avatar}
        {name ? (
          <Text variant="label" tone="muted" numberOfLines={1} className="shrink">
            {name}
          </Text>
        ) : null}
        {tag}
      </View>
    ) : null;
  const head =
    headRow && onPressSender ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr.chat.openProfile(name ?? '')}
        onPress={onPressSender}
        hitSlop={SPACING[1]}
        className="self-start"
      >
        {headRow}
      </Pressable>
    ) : (
      headRow
    );
  return (
    <View className="gap-1 self-start" style={{ maxWidth: '88%' }}>
      {head}
      <View className="items-start gap-1" style={{ paddingLeft: avatar ? INDENT : 0 }}>
        {bar}
        <SwipeToReply onReply={onReply}>{bubble}</SwipeToReply>
        {chips}
        {stamp}
      </View>
    </View>
  );
}

// The answered message inside a bubble: a bar on the left, the sender's name and one line of text.
function QuoteBlock({ quote, mine }: { quote: ChatQuote; mine: boolean }) {
  const { colors, shape } = useTheme();
  return (
    <View
      style={{
        marginBottom: SPACING[1.5],
        paddingHorizontal: SPACING[2.5],
        paddingVertical: SPACING[1.5],
        borderRadius: shape.radius.sm,
        borderLeftWidth: SPACING[1],
        borderLeftColor: mine ? colors.onAccent : colors.violet,
        backgroundColor: mine ? withAlpha(colors.onAccent, 0.16) : colors.surface2,
      }}
    >
      <Text variant="label" color={mine ? colors.onAccent : colors.violet} numberOfLines={1}>
        {quote.name}
      </Text>
      <Text variant="fine" color={mine ? colors.onAccent : colors.text} numberOfLines={1}>
        {quote.text}
      </Text>
    </View>
  );
}

// Swipe a message to the right to answer it (no gesture library: the responder system). A reply
// arrow fades in behind it; past the trigger it answers, then springs back.
function SwipeToReply({ onReply, children }: { onReply?: () => void; children: ReactNode }) {
  const { colors, shape } = useTheme();
  const [dx] = useState(() => new Animated.Value(0));
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(0);
  if (!onReply) return children;
  const settle = () => {
    moved.current = 0;
    Animated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
  };
  return (
    <View
      onTouchStart={(e) => {
        start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      }}
      onMoveShouldSetResponderCapture={(e) => {
        const s = start.current;
        if (!s) return false;
        const x = e.nativeEvent.pageX - s.x;
        const y = e.nativeEvent.pageY - s.y;
        return x > SWIPE_SLOP && x > Math.abs(y) * 1.5;
      }}
      onResponderTerminationRequest={() => false}
      onResponderMove={(e) => {
        const s = start.current;
        if (!s) return;
        moved.current = Math.max(0, Math.min(SWIPE_MAX, e.nativeEvent.pageX - s.x));
        dx.setValue(moved.current);
      }}
      onResponderRelease={() => {
        if (moved.current >= SWIPE_TRIGGER) onReply();
        settle();
      }}
      onResponderTerminate={settle}
      style={{ maxWidth: '100%' }}
    >
      <Animated.View
        pointerEvents="none"
        className="absolute items-center justify-center"
        style={{
          left: -SPACING[10],
          top: 0,
          bottom: 0,
          opacity: dx.interpolate({ inputRange: [0, SWIPE_TRIGGER], outputRange: [0, 1] }),
        }}
      >
        <View
          className="items-center justify-center"
          style={{
            width: SPACING[8],
            height: SPACING[8],
            borderRadius: shape.radius.pill,
            backgroundColor: colors.surface2,
          }}
        >
          <Ionicons name="arrow-undo" size={ICON.sm} color={colors.text} />
        </View>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: dx }] }}>{children}</Animated.View>
    </View>
  );
}

// The long-press bar: the six reactions, 3D like the buttons.
function ReactionBar({ onPick }: { onPick: (emoji: Reaction) => void }) {
  const { colors, shape } = useTheme();
  const depth = useDepth();
  return (
    <View
      accessibilityRole="menu"
      accessibilityLabel={tr.chat.react}
      testID="reaction-bar"
      className="flex-row"
      style={[
        {
          gap: SPACING[0.5],
          padding: SPACING[1],
          borderRadius: shape.radius.pill,
          backgroundColor: colors.surface,
        },
        depth(),
      ]}
    >
      {REACTIONS.map((emoji) => (
        <Pressable
          key={emoji}
          accessibilityRole="menuitem"
          accessibilityLabel={tr.chat.reactWith(emoji)}
          testID={`react-${REACTIONS.indexOf(emoji)}`}
          onPress={() => onPick(emoji)}
        >
          {({ pressed }) => (
            <View
              className="items-center justify-center"
              style={{
                width: TOUCH.min,
                height: TOUCH.min,
                borderRadius: shape.radius.pill,
                backgroundColor: pressed ? colors.surface2 : 'transparent',
              }}
            >
              <Text variant="title">{emoji}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// Under a bubble: each reaction with its count; the viewer's own is marked and can be taken back.
function ReactionChips({
  reactions,
  onToggle,
  mine,
}: {
  reactions: readonly ChatReaction[];
  onToggle?: (emoji: string) => void;
  mine: boolean;
}) {
  const { colors, shape } = useTheme();
  const chipHeight = SPACING[7];
  return (
    <View
      className="flex-row flex-wrap"
      style={{
        gap: SPACING[1],
        marginTop: -SPACING[1.5],
        paddingHorizontal: SPACING[2],
        justifyContent: mine ? 'flex-end' : 'flex-start',
      }}
    >
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          accessibilityRole="button"
          accessibilityState={{ selected: r.mine }}
          accessibilityLabel={tr.chat.reactionChip(r.emoji, r.count, r.mine)}
          disabled={!onToggle}
          onPress={() => onToggle?.(r.emoji)}
          hitSlop={(TOUCH.min - chipHeight) / 2}
        >
          <View
            className="flex-row items-center"
            style={{
              gap: SPACING[1],
              height: chipHeight,
              paddingHorizontal: SPACING[2],
              borderRadius: shape.radius.pill,
              borderWidth: shape.stroke.hairline,
              borderColor: r.mine ? colors.violet : colors.divider,
              backgroundColor: r.mine ? withAlpha(colors.violet, 0.16) : colors.surface,
            }}
          >
            <Text variant="caption">{r.emoji}</Text>
            <Text variant="caption" tabular>
              {String(r.count)}
            </Text>
          </View>
        </Pressable>
      ))}
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
