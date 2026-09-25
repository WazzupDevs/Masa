import { MAX_MESSAGE_LENGTH, prepareMessage } from '@shared/chat.ts';
import { canRetry, type OutboxMessage, outboxReducer } from '@shared/chatOutbox.ts';
import { useQueryClient } from '@tanstack/react-query';
import { useReducer, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { tr } from '@/i18n/tr';
import { ApiError, chatApi } from '@/lib/api';

import { messagesKey, useMessages } from './useMessages';

type Props = { roomId: string; sessionId: string };

let nextLocalId = 0;

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
    <View className="mt-6 rounded-2xl border border-neutral-200">
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between px-4 py-3"
      >
        <Text className="text-base font-semibold text-black">{tr.chat.title}</Text>
        <Text className="text-sm text-blue-600">{open ? tr.chat.hide : tr.chat.show}</Text>
      </Pressable>
      {open ? (
        <View className="border-t border-neutral-200 px-4 pb-4">
          <View className="max-h-72 gap-2 py-3">
            {messages.data?.length === 0 && outbox.length === 0 ? (
              <Text className="text-sm text-neutral-500">{tr.chat.empty}</Text>
            ) : null}
            {messages.data?.map((m) => (
              <View key={m.id} className={m.session_id === sessionId ? 'items-end' : 'items-start'}>
                <Text className="text-xs text-neutral-500">{m.sender_alias}</Text>
                <Text
                  className={`rounded-xl px-3 py-2 text-base ${m.session_id === sessionId ? 'bg-black text-white' : 'bg-neutral-100 text-black'}`}
                >
                  {m.body}
                </Text>
              </View>
            ))}
            {outbox.map((m) => (
              <View key={m.localId} className="items-end">
                <Text
                  className={`rounded-xl px-3 py-2 text-base text-white ${m.status === 'sending' ? 'bg-neutral-500' : 'bg-red-700'}`}
                >
                  {m.body}
                </Text>
                {m.status === 'sending' ? (
                  <Text className="text-xs text-neutral-400">{tr.chat.sending}</Text>
                ) : (
                  <View className="flex-row items-center gap-3">
                    <Text className="text-xs text-red-600">
                      {m.errorCode ? tr.errors[m.errorCode] : tr.chat.notSent}
                    </Text>
                    {canRetry(m) ? (
                      <Pressable accessibilityRole="button" onPress={() => retry(m)}>
                        <Text className="text-xs font-semibold text-blue-600">{tr.chat.retry}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => dispatch({ type: 'remove', localId: m.localId })}
                    >
                      <Text className="text-xs text-neutral-500">{tr.chat.discard}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
          <View className="flex-row items-center gap-2">
            <TextInput
              className="h-11 flex-1 rounded-xl border border-neutral-300 px-3 text-base text-black"
              placeholder={tr.chat.placeholder}
              value={draft}
              onChangeText={setDraft}
              maxLength={MAX_MESSAGE_LENGTH}
              onSubmitEditing={submit}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!body}
              onPress={submit}
              className={`h-11 justify-center rounded-xl bg-black px-4 ${!body ? 'opacity-40' : ''}`}
            >
              <Text className="text-base font-semibold text-white">{tr.chat.send}</Text>
            </Pressable>
          </View>
          <Text className="mt-1 text-right text-xs text-neutral-400">
            {tr.chat.counter([...draft].length, MAX_MESSAGE_LENGTH)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
