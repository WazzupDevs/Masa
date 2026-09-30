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
  testID?: string;
};

// One chat message (canvas: Bileşenler → Sohbet baloncuğu): the other side left with an avatar,
// the viewer right in the accent colour; the corner on the speaker's side is small.
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
  testID,
}: Props) {
  const { colors, shape } = useTheme();
  const big = shape.radius.md;
  const small = SPACING[1.5];
  const bubble = (
    <View
      testID={testID}
      style={{
        maxWidth: '100%',
        paddingHorizontal: SPACING[3] + SPACING[0.5],
        paddingVertical: SPACING[2],
        borderTopLeftRadius: big,
        borderTopRightRadius: big,
        borderBottomLeftRadius: mine ? big : small,
        borderBottomRightRadius: mine ? small : big,
        borderWidth: shape.stroke.card,
        borderColor: colors.border,
        backgroundColor: mine ? colors.accent : colors.surface,
      }}
    >
      <Text tone={mine ? 'onAccent' : 'text'}>{text}</Text>
    </View>
  );

  if (mine) {
    return (
      <View className="items-end gap-1 self-end" style={{ maxWidth: '82%' }}>
        {bubble}
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
    name || tag ? (
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
    <View className="gap-1">
      {head}
      {bubble}
    </View>
  );
  return (
    <View className="flex-row items-end gap-2 self-start" style={{ maxWidth: '88%' }}>
      {avatar}
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
