import { MAX_MESSAGE_LENGTH, prepareMessage } from '@shared/chat.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { chatApi } from '@/lib/api';

import { messagesKey, useMessages } from './useMessages';

type Props = { roomId: string; sessionId: string };

// Collapsible chat at the bottom of the room (MVP_SPEC §4.5, screen 5).
export function ChatPanel({ roomId, sessionId }: Props) {
  const queryClient = useQueryClient();
  const messages = useMessages(roomId);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');

  const send = useMutation({
    mutationFn: (body: string) => chatApi.send(roomId, body),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: messagesKey(roomId) });
    },
  });

  const body = prepareMessage(draft);

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
            {messages.data?.length === 0 ? (
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
          </View>
          {send.isError ? (
            <Text className="mb-2 text-sm text-red-600">{errorMessage(send.error)}</Text>
          ) : null}
          <View className="flex-row items-center gap-2">
            <TextInput
              className="h-11 flex-1 rounded-xl border border-neutral-300 px-3 text-base text-black"
              placeholder={tr.chat.placeholder}
              value={draft}
              onChangeText={setDraft}
              maxLength={MAX_MESSAGE_LENGTH}
              onSubmitEditing={() => body && send.mutate(body)}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!body || send.isPending}
              onPress={() => body && send.mutate(body)}
              className={`h-11 justify-center rounded-xl bg-black px-4 ${!body || send.isPending ? 'opacity-40' : ''}`}
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
