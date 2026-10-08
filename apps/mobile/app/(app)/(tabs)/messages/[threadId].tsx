import type { ReportReason } from '@shared/chat.ts';
import { DM_MAX_LENGTH, prepareDm } from '@shared/friends.ts';
import { canRetry, type OutboxMessage, outboxReducer } from '@shared/chatOutbox.ts';
import { toRuns } from '@shared/chatRuns.ts';
import { BROADCAST, dmChannel } from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { ChatBubble, type Delivery, TypingBubble } from '@/components/ChatBubble';
import { ChatScreen, DayLine, dayLabel } from '@/components/ChatScreen';
import { ChatTopBar } from '@/components/ChatTopBar';
import { Composer } from '@/components/Composer';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Sheet } from '@/components/Sheet';
import { useHideTabBar } from '@/components/TabBar';
import { ReportModal } from '@/features/chat/ReportModal';
import { ConfirmWithReport } from '@/features/friends/ConfirmWithReport';
import { friendKeys, useDmMessages, useFriends } from '@/features/friends/queries';
import { useDmTyping } from '@/features/friends/useDmTyping';
import { useBroadcast } from '@/features/rooms/useBroadcast';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { ApiError, dmApi, friendsApi, safetyApi } from '@/lib/api';

type Params = { threadId: string; publicId: string; name: string };

const isDelivery = (status: string | null): status is Delivery =>
  status === 'sent' || status === 'delivered' || status === 'read';

let nextLocalId = 0;

// A DM thread with a friend (docs/SPEC_V2.md §6.4). The dm: channel carries no data; the page is
// reread through dm_messages_page (`from_me`, never the sender's account id). Read state stays
// with the reader. The friend's photo comes from the friends list (its signed URL expires, so it
// never travels in the route). No tab bar here: the message bar sits at the bottom.
// v3 step 6 (docs/SPEC_V3.md §18.3): ticks on the own messages from their status (dm_status asks
// for a reread), a message on its way shows at once with the waiting state, and "yazıyor"
// (dm_typing) shows the other side's dots.
export default function DmScreen() {
  const { threadId, publicId, name } = useLocalSearchParams<Params>();
  useHideTabBar();
  const queryClient = useQueryClient();
  const friend = useFriends().data?.find((f) => f.publicId === publicId);
  const photoUrl = friend?.photoUrl ?? null;
  const messages = useDmMessages(threadId);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<'remove' | 'block' | null>(null);
  const [reporting, setReporting] = useState(false);
  const [outbox, dispatch] = useReducer(outboxReducer, []);
  const { typing, notifyTyping, clearTyping } = useDmTyping(threadId);

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: friendKeys.dm(threadId) });
    void dmApi.read(threadId).catch(() => undefined);
  }, [queryClient, threadId]);
  useBroadcast(dmChannel(threadId), BROADCAST.dmMessage, refetch);
  // A tick moved (delivered or read): only the page is read again.
  const rereadPage = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: friendKeys.dm(threadId) }),
    [queryClient, threadId],
  );
  useBroadcast(dmChannel(threadId), BROADCAST.dmStatus, rereadPage);

  // The other side's newest message: when it changes, their typing dots go.
  const newestFromThem = messages.data?.find((m) => !m.from_me)?.id;
  const seenFromThem = useRef(newestFromThem);
  useEffect(() => {
    if (newestFromThem === seenFromThem.current) return;
    seenFromThem.current = newestFromThem;
    clearTyping();
  }, [newestFromThem, clearTyping]);

  useEffect(() => {
    void dmApi
      .read(threadId)
      .then(() => queryClient.invalidateQueries({ queryKey: friendKeys.list }))
      .catch(() => undefined);
  }, [queryClient, threadId]);

  const body = prepareDm(draft);
  // Sending is optimistic, as in the room chat (@shared/chatOutbox.ts): the message shows at once
  // with the waiting state and is replaced by the server's copy.
  const deliver = (localId: string, text: string) => {
    dmApi
      .send(threadId, text)
      .then(async () => {
        track('dm_sent', {});
        await queryClient.invalidateQueries({ queryKey: friendKeys.dm(threadId) });
        dispatch({ type: 'sent', localId });
      })
      .catch((err: unknown) =>
        dispatch({ type: 'failed', localId, errorCode: err instanceof ApiError ? err.code : null }),
      );
  };
  const submit = () => {
    if (!body) return;
    nextLocalId += 1;
    const localId = `dm-${nextLocalId}`;
    dispatch({ type: 'send', localId, body });
    setDraft('');
    deliver(localId, body);
  };
  const retry = (m: OutboxMessage) => {
    dispatch({ type: 'retry', localId: m.localId });
    deliver(m.localId, m.body);
  };
  const onChangeDraft = (text: string) => {
    setDraft(text);
    if (text.trim()) notifyTyping();
  };

  const leave = () => {
    void queryClient.invalidateQueries({ queryKey: friendKeys.all });
    router.back();
  };
  const end = useMutation({
    mutationFn: ({ kind, reason }: { kind: 'remove' | 'block'; reason?: ReportReason }) =>
      kind === 'remove'
        ? friendsApi.remove(publicId, reason)
        : safetyApi.blockFriend(publicId, reason),
    onSuccess: (_data, { kind, reason }) => {
      if (kind === 'block') track('block_created', {});
      if (reason) track('report_submitted', {});
      setConfirm(null);
      leave();
    },
  });
  const report = useMutation({
    mutationFn: (reason: ReportReason) => safetyApi.reportDm(threadId, reason),
    onSuccess: () => {
      track('report_submitted', {});
      setReporting(false);
      Alert.alert(tr.safety.reportSent);
    },
  });

  const list = [...(messages.data ?? [])].reverse();
  const runs = toRuns(
    list,
    (m) => (m.from_me ? 'me' : 'them'),
    (m) => m.created_at,
  );
  const openProfile = () => router.push({ pathname: '/people/[publicId]', params: { publicId } });
  return (
    <ChatScreen
      stickToEnd
      top={
        <ChatTopBar
          onBack={() => router.back()}
          title={name}
          subtitle={friend ? tr.friends.since(friend.since) : undefined}
          leading={<Avatar kind="profile" name={name} size="md" photoUrl={photoUrl} />}
          onPressTitle={openProfile}
          titleAccessibilityLabel={name}
          actions={
            <IconButton
              icon="ellipsis-horizontal"
              label={tr.friends.more}
              onPress={() => setMenu(true)}
            />
          }
        />
      }
      composer={
        <Composer
          inputTestID="dm-input"
          sendTestID="dm-send"
          sendLabel={tr.dm.send}
          placeholder={tr.dm.placeholder}
          value={draft}
          onChangeText={onChangeDraft}
          maxLength={DM_MAX_LENGTH}
          sendDisabled={!body}
          onSend={submit}
        />
      }
    >
      {list.length === 0 && outbox.length === 0 && !messages.isPending ? (
        <View className="flex-1 justify-center">
          <EmptyState snail body={tr.friends.noMessagesYet} />
        </View>
      ) : null}
      {runs.map(({ item: m, first, last, day }) => (
        <View key={m.id} className={first ? 'mt-1.5 gap-2' : 'gap-2'}>
          {day ? <DayLine label={dayLabel(day)} /> : null}
          <ChatBubble
            text={m.body}
            mine={m.from_me}
            first={first}
            last={last}
            time={tr.chat.time(m.created_at)}
            delivery={m.from_me && isDelivery(m.status) ? m.status : undefined}
            avatar={
              m.from_me ? undefined : (
                <Avatar kind="profile" name={name} size="sm" photoUrl={photoUrl} />
              )
            }
          />
        </View>
      ))}
      {outbox.map((m) => (
        <ChatBubble
          key={m.localId}
          text={m.body}
          mine
          state={m.status === 'sending' ? 'sending' : 'failed'}
          failedText={m.status === 'failed' && m.errorCode ? tr.errors[m.errorCode] : undefined}
          onRetry={m.status === 'failed' && canRetry(m) ? () => retry(m) : undefined}
          onDiscard={
            m.status === 'failed'
              ? () => dispatch({ type: 'remove', localId: m.localId })
              : undefined
          }
        />
      ))}
      {typing ? (
        <TypingBubble
          testID="dm-typing"
          avatar={<Avatar kind="profile" name={name} size="sm" photoUrl={photoUrl} />}
        />
      ) : null}

      <Sheet visible={menu} onClose={() => setMenu(false)} title={tr.friends.friendMenuTitle}>
        <Button
          variant="neutral"
          label={tr.friends.viewProfile}
          onPress={() => {
            setMenu(false);
            openProfile();
          }}
        />
        <Button
          variant="neutral"
          label={tr.dm.report}
          onPress={() => {
            setMenu(false);
            setReporting(true);
          }}
        />
        <Button
          variant="neutral"
          label={tr.friends.removeFriend}
          onPress={() => {
            setMenu(false);
            setConfirm('remove');
          }}
        />
        <Button
          variant="danger"
          label={tr.friends.block}
          onPress={() => {
            setMenu(false);
            setConfirm('block');
          }}
        />
        <Button variant="ghost" label={tr.common.cancel} onPress={() => setMenu(false)} />
      </Sheet>

      <ReportModal
        visible={reporting}
        pending={report.isPending}
        error={report.error}
        onReport={(reason) => report.mutate(reason)}
        onClose={() => setReporting(false)}
      />
      <ConfirmWithReport
        visible={confirm !== null}
        title={confirm === 'block' ? tr.safety.blockConfirmTitle : tr.friends.removeFriend}
        hint={confirm === 'block' ? tr.friends.blockHint : tr.friends.removeHint}
        confirmLabel={confirm === 'block' ? tr.friends.blockConfirm : tr.friends.removeConfirm}
        pending={end.isPending}
        error={end.error}
        onConfirm={(reason) => confirm && end.mutate({ kind: confirm, reason })}
        onClose={() => setConfirm(null)}
      />
    </ChatScreen>
  );
}
