import { MAX_MESSAGE_LENGTH, prepareMessage } from '@shared/chat.ts';
import { canRetry, type OutboxMessage, outboxReducer } from '@shared/chatOutbox.ts';
import { useQueryClient } from '@tanstack/react-query';
import { useReducer, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { ApiError, chatApi } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { messagesKey, useMessages } from './useMessages';

type Props = { roomId: string; sessionId: string };

let nextLocalId = 0;

// The message list's height before it is cut (as before the design pass).
const MESSAGES_MAX_HEIGHT = 288;

// Collapsible chat at the bottom of the room (MVP_SPEC §4.5, screen 5). Sending is optimistic: the
// message shows at once and is replaced by the server's copy; a failed one offers a retry when
// retrying can help (@shared/chatOutbox.ts).
export function ChatPanel({ roomId, sessionId }: Props) {
  const queryClient = useQueryClient();
  const messages = useMessages(roomId);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const [outbox, dispatch] = useReducer(outboxReducer, []);

  const deliver = (localId: string, text: string) => {
    chatApi
      .send(roomId, text)
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: messagesKey(roomId) });
        dispatch({ type: 'sent', localId });
      })
      .catch((err: unknown) => {
        dispatch({
          type: 'failed',
          localId,
          errorCode: err instanceof ApiError ? err.code : null,
        });
      });
  };

  const body = prepareMessage(draft);
  const submit = () => {
    if (!body) return;
    nextLocalId += 1;
    const localId = `local-${nextLocalId}`;
    dispatch({ type: 'send', localId, body });
    setDraft('');
    deliver(localId, body);
  };
  const retry = (m: OutboxMessage) => {
    dispatch({ type: 'retry', localId: m.localId });
    deliver(m.localId, m.body);
  };

  return (
    <Card className="mt-6">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between"
        style={{ minHeight: TOUCH.min }}
      >
        <Text variant="heading">{tr.chat.title}</Text>
        <Text variant="label" tone="accent">
          {open ? tr.chat.hide : tr.chat.show}
        </Text>
      </Pressable>
      {open ? (
        <View>
          <View className="gap-2 py-3" style={{ maxHeight: MESSAGES_MAX_HEIGHT }}>
            {messages.data?.length === 0 && outbox.length === 0 ? (
              <Text variant="fine">{tr.chat.empty}</Text>
            ) : null}
            {messages.data?.map((m) => {
              const mine = m.session_id === sessionId;
              return (
                <View key={m.id} className={mine ? 'items-end' : 'items-start'}>
                  <Text variant="fine">{m.sender_alias}</Text>
                  <Bubble tone={mine ? 'mine' : 'theirs'}>{m.body}</Bubble>
                </View>
              );
            })}
            {outbox.map((m) => (
              <View key={m.localId} className="items-end">
                <Bubble tone={m.status === 'sending' ? 'sending' : 'failed'}>{m.body}</Bubble>
                {m.status === 'sending' ? (
                  <Text variant="fine">{tr.chat.sending}</Text>
                ) : (
                  <View className="flex-row items-center gap-1">
                    <Text variant="fine" tone="danger">
                      {m.errorCode ? tr.errors[m.errorCode] : tr.chat.notSent}
                    </Text>
                    {canRetry(m) ? (
                      <SmallAction label={tr.chat.retry} onPress={() => retry(m)} />
                    ) : null}
                    <SmallAction
                      label={tr.chat.discard}
                      muted
                      onPress={() => dispatch({ type: 'remove', localId: m.localId })}
                    />
                  </View>
                )}
              </View>
            ))}
          </View>
          <View className="flex-row items-start gap-2">
            <View className="flex-1">
              <Input
                accessibilityLabel={tr.chat.placeholder}
                placeholder={tr.chat.placeholder}
                value={draft}
                onChangeText={setDraft}
                maxLength={MAX_MESSAGE_LENGTH}
                onSubmitEditing={submit}
                counter={tr.chat.counter([...draft].length, MAX_MESSAGE_LENGTH)}
              />
            </View>
            <Button label={tr.chat.send} disabled={!body} onPress={submit} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

type BubbleTone = 'mine' | 'theirs' | 'sending' | 'failed';

function Bubble({ tone, children }: { tone: BubbleTone; children: string }) {
  const { colors, shape } = useTheme();
  const fill = {
    mine: { bg: colors.accent, fg: colors.onAccent },
    theirs: { bg: colors.surface2, fg: colors.text },
    sending: { bg: colors.accent, fg: colors.onAccent },
    failed: { bg: colors.danger, fg: colors.onDanger },
  }[tone];
  return (
    <View
      style={{
        maxWidth: '85%',
        borderRadius: shape.radius.md,
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2],
        backgroundColor: fill.bg,
        opacity: tone === 'sending' ? 0.6 : 1,
      }}
    >
      <Text color={fill.fg}>{children}</Text>
    </View>
  );
}

// "Tekrar dene" / "Sil" under a failed message: text buttons, 44 high for the finger.
function SmallAction({
  label,
  onPress,
  muted,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="justify-center px-2"
      style={{ minHeight: TOUCH.min }}
    >
      <Text variant="label" tone={muted ? 'muted' : 'accent'}>
        {label}
      </Text>
    </Pressable>
  );
}
