import { MAX_MESSAGE_LENGTH, prepareMessage } from '@shared/chat.ts';
import { canRetry, type OutboxMessage, outboxReducer } from '@shared/chatOutbox.ts';
import { parseQuote, parseReactionCounts } from '@shared/messageExtras.ts';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useReducer, useState } from 'react';
import { View } from 'react-native';

import { toRuns } from '@shared/chatRuns.ts';

import { Avatar } from '@/components/Avatar';
import { ChatBubble } from '@/components/ChatBubble';
import { DayLine, dayLabel } from '@/components/ChatScreen';
import { Composer } from '@/components/Composer';
import { Text } from '@/components/Text';
import { useRoomMemberProfile } from '@/features/profile/queries';
import { tr } from '@/i18n/tr';
import { ApiError, chatApi } from '@/lib/api';

import { toChatQuote, useReactions, useReplyTarget } from './messageExtras';
import { messagesKey, useMessages, useRoomChatExtras } from './useMessages';

let nextLocalId = 0;

// The room chat (MVP_SPEC §4.5). Sending is optimistic: the message shows at once and is replaced
// by the server's copy; a failed one offers a retry when retrying can help (@shared/chatOutbox.ts).
// docs/SPEC_V3.md §21: replies and reactions; tables by their aliases.
export function useRoomChat(roomId: string) {
  const queryClient = useQueryClient();
  const messages = useMessages(roomId);
  const extras = useRoomChatExtras(roomId);
  const [draft, setDraft] = useState('');
  const [outbox, dispatch] = useReducer(outboxReducer, []);
  const reply = useReplyTarget();
  const reactions = useReactions(chatApi.react, () =>
    queryClient.invalidateQueries({ queryKey: messagesKey(roomId) }),
  );

  const deliver = (localId: string, text: string, replyTo?: string) => {
    chatApi
      .send(roomId, text, replyTo)
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
    const replyTo = reply.target?.id;
    dispatch({ type: 'send', localId, body, ...(replyTo ? { replyTo } : {}) });
    setDraft('');
    reply.clear();
    deliver(localId, body, replyTo);
  };
  const retry = (m: OutboxMessage) => {
    dispatch({ type: 'retry', localId: m.localId });
    deliver(m.localId, m.body, m.replyTo);
  };
  const discard = (m: OutboxMessage) => dispatch({ type: 'remove', localId: m.localId });
  return {
    messages,
    extras,
    outbox,
    draft,
    setDraft,
    body,
    submit,
    retry,
    discard,
    reply,
    reactions,
  };
}

export type RoomChat = ReturnType<typeof useRoomChat>;

// The room's messages in runs (canvas: Aşama 4 · Yenileme), then the ones still on their way. In a
// profiled room the other table's photo opens its profile, as the top bar's title does.
export function RoomMessages({
  chat,
  sessionId,
  roomId,
  guestSessionId,
}: {
  chat: RoomChat;
  sessionId: string;
  roomId: string;
  guestSessionId: string | null;
}) {
  const publicId = useRoomMemberProfile(roomId, guestSessionId).data;
  const openProfile = publicId
    ? () => router.push({ pathname: '/people/[publicId]', params: { publicId } })
    : undefined;
  const list = chat.messages.data ?? [];
  const extras = chat.extras.data;
  // The quote of a message on its way, from the loaded list.
  const outboxQuote = (id: string | undefined) => {
    const q = id ? list.find((m) => m.id === id) : undefined;
    return q
      ? toChatQuote({
          gone: false,
          id: q.id,
          body: q.body,
          fromMe: q.session_id === sessionId,
          name: q.sender_alias,
        })
      : undefined;
  };
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
        const extra = extras?.get(m.id);
        const counts = parseReactionCounts(extra?.reactions);
        return (
          <View key={m.id} className={first ? 'mt-1.5 gap-2' : 'gap-2'}>
            {day ? <DayLine label={dayLabel(day)} /> : null}
            <ChatBubble
              text={m.body}
              mine={mine}
              quote={m.replied ? toChatQuote(parseQuote(extra?.reply_to)) : undefined}
              reactions={chat.reactions.view(m.id, counts)}
              onToggleReaction={(emoji) => chat.reactions.pick(m.id, counts, emoji)}
              onReact={(emoji) => chat.reactions.pick(m.id, counts, emoji)}
              onReply={() =>
                chat.reply.setTarget({
                  id: m.id,
                  quote: { name: mine ? tr.chat.you : m.sender_alias, text: m.body },
                })
              }
              first={first}
              last={last}
              time={tr.chat.time(m.created_at)}
              name={mine ? undefined : m.sender_alias}
              avatar={mine ? undefined : <Avatar kind="table" alias={m.sender_alias} size="sm" />}
              onPressSender={mine ? undefined : openProfile}
            />
          </View>
        );
      })}
      {chat.outbox.map((m) => (
        <ChatBubble
          key={m.localId}
          text={m.body}
          mine
          quote={outboxQuote(m.replyTo)}
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
      replyTo={chat.reply.target?.quote}
      onCancelReply={chat.reply.clear}
      counter={chat.draft ? tr.chat.counter([...chat.draft].length, MAX_MESSAGE_LENGTH) : undefined}
    />
  );
}
