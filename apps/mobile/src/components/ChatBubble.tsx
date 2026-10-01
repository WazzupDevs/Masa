import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

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
  onRetry?: () => void;
  onDiscard?: () => void;
  // A run of messages from one sender (canvas: Aşama 4 · Yenileme): the name over the first, the
  // avatar and the time beside and under the last, tight corners inside the run. A lone message is
  // both first and last.
  first?: boolean;
  last?: boolean;
  time?: string;
  testID?: string;
};

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
  onRetry,
  onDiscard,
  first = true,
  last = true,
  time,
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
        boxShadow: mine ? undefined : shape.shadow.raised,
      }}
    >
      <Text tone={mine ? 'onAccent' : 'text'}>{text}</Text>
    </View>
  );
  const stamp =
    time && last && !state ? (
      <View style={{ paddingHorizontal: SPACING[1.5] }}>
        <Text variant="fine">{time}</Text>
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
              {state === 'failed' ? tr.chat.notSent : tr.chat.sending}
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
  return (
    <View className="flex-row items-end gap-2 self-start" style={{ maxWidth: '88%' }}>
      {face}
      <View className="shrink">
        {onPressSender ? (
          <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onPressSender}>
            {content}
          </Pressable>
        ) : (
          content
        )}
      </View>
    </View>
  );
}
