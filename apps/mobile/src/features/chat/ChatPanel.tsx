import { MAX_MESSAGE_LENGTH, prepareMessage } from '@shared/chat.ts';
import { canRetry, type OutboxMessage, outboxReducer } from '@shared/chatOutbox.ts';
import { useQueryClient } from '@tanstack/react-query';
import { useReducer, useState } from 'react';
import { View } from 'react-native';

import { toRuns } from '@shared/chatRuns.ts';

import { Avatar } from '@/components/Avatar';
import { ChatBubble } from '@/components/ChatBubble';
import { DayLine, dayLabel } from '@/components/ChatScreen';
import { Composer } from '@/components/Composer';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { ApiError, chatApi } from '@/lib/api';

import { messagesKey, useMessages } from './useMessages';

let nextLocalId = 0;

// The room chat (MVP_SPEC §4.5). Sending is optimistic: the message shows at once and is replaced
// by the server's copy; a failed one offers a retry when retrying can help (@shared/chatOutbox.ts).
export function useRoomChat(roomId: string) {
  const queryClient = useQueryClient();
  const messages = useMessages(roomId);
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
  const discard = (m: OutboxMessage) => dispatch({ type: 'remove', localId: m.localId });
  return { messages, outbox, draft, setDraft, body, submit, retry, discard };
}

export type RoomChat = ReturnType<typeof useRoomChat>;

// The room's messages in runs (canvas: Aşama 4 · Yenileme), then the ones still on their way.
export function RoomMessages({ chat, sessionId }: { chat: RoomChat; sessionId: string }) {
  const list = chat.messages.data ?? [];
  const runs = toRuns(
    list,
    (m) => m.session_id,
    (m) => m.created_at,
  );
  return (
    <>
      {list.length === 0 && chat.outbox.length === 0 ? (
        <Text variant="fine" align="center" className="mt-2">
          {tr.chat.empty}
        </Text>
      ) : null}
      {runs.map(({ item: m, first, last, day }) => {
        const mine = m.session_id === sessionId;
        return (
          <View key={m.id} className={first ? 'mt-1.5 gap-2' : 'gap-2'}>
            {day ? <DayLine label={dayLabel(day)} /> : null}
            <ChatBubble
              text={m.body}
              mine={mine}
              first={first}
              last={last}
              time={tr.chat.time(m.created_at)}
              name={mine ? undefined : m.sender_alias}
              avatar={mine ? undefined : <Avatar kind="table" alias={m.sender_alias} size="sm" />}
            />
          </View>
        );
      })}
      {chat.outbox.map((m) => (
        <ChatBubble
          key={m.localId}
          text={m.body}
          mine
          state={m.status === 'sending' ? 'sending' : 'failed'}
          failedText={m.status === 'failed' && m.errorCode ? tr.errors[m.errorCode] : undefined}
          onRetry={m.status === 'failed' && canRetry(m) ? () => chat.retry(m) : undefined}
          onDiscard={m.status === 'failed' ? () => chat.discard(m) : undefined}
        />
      ))}
    </>
  );
}

export function RoomComposer({ chat }: { chat: RoomChat }) {
  return (
    <Composer
      sendLabel={tr.chat.send}
      placeholder={tr.chat.placeholder}
      value={chat.draft}
      onChangeText={chat.setDraft}
      maxLength={MAX_MESSAGE_LENGTH}
      sendDisabled={!chat.body}
      onSend={chat.submit}
      counter={chat.draft ? tr.chat.counter([...chat.draft].length, MAX_MESSAGE_LENGTH) : undefined}
    />
  );
}
