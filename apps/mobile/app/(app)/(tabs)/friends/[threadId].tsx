import type { ReportReason } from '@shared/chat.ts';
import { DM_MAX_LENGTH, prepareDm } from '@shared/friends.ts';
import { toRuns } from '@shared/chatRuns.ts';
import { BROADCAST, dmChannel } from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatScreen, DayLine, dayLabel } from '@/components/ChatScreen';
import { ChatTopBar } from '@/components/ChatTopBar';
import { Composer } from '@/components/Composer';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { ReportModal } from '@/features/chat/ReportModal';
import { ConfirmWithReport } from '@/features/friends/ConfirmWithReport';
import { friendKeys, useDmMessages } from '@/features/friends/queries';
import { useBroadcast } from '@/features/rooms/useBroadcast';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { dmApi, friendsApi, safetyApi } from '@/lib/api';

type Params = { threadId: string; publicId: string; name: string };

// A DM thread with a friend (docs/SPEC_V2.md §6.4). The dm: channel carries no data; the page is
// reread through dm_messages_page (`from_me`, never the sender's account id). Read state stays
// with the reader.
export default function DmScreen() {
  const { threadId, publicId, name } = useLocalSearchParams<Params>();
  const queryClient = useQueryClient();
  const messages = useDmMessages(threadId);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<'remove' | 'block' | null>(null);
  const [reporting, setReporting] = useState(false);

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: friendKeys.dm(threadId) });
    void dmApi.read(threadId).catch(() => undefined);
  }, [queryClient, threadId]);
  useBroadcast(dmChannel(threadId), BROADCAST.dmMessage, refetch);

  useEffect(() => {
    void dmApi
      .read(threadId)
      .then(() => queryClient.invalidateQueries({ queryKey: friendKeys.list }))
      .catch(() => undefined);
  }, [queryClient, threadId]);

  const body = prepareDm(draft);
  const send = useMutation({
    mutationFn: (text: string) => dmApi.send(threadId, text),
    onSuccess: () => {
      track('dm_sent', {});
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: friendKeys.dm(threadId) });
    },
  });

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
          leading={<Avatar kind="profile" name={name} size="md" />}
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
          onChangeText={setDraft}
          maxLength={DM_MAX_LENGTH}
          sendDisabled={!body}
          sending={send.isPending}
          onSend={() => body && send.mutate(body)}
          above={
            send.isError ? (
              <Text variant="fine" tone="danger">
                {errorMessage(send.error)}
              </Text>
            ) : undefined
          }
        />
      }
    >
      {list.length === 0 && !messages.isPending ? (
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
            avatar={m.from_me ? undefined : <Avatar kind="profile" name={name} size="sm" />}
          />
        </View>
      ))}

      <Sheet visible={menu} onClose={() => setMenu(false)} title={tr.friends.friendMenuTitle}>
        <Button
          variant="secondary"
          label={tr.friends.viewProfile}
          onPress={() => {
            setMenu(false);
            openProfile();
          }}
        />
        <Button
          variant="secondary"
          label={tr.dm.report}
          onPress={() => {
            setMenu(false);
            setReporting(true);
          }}
        />
        <Button
          variant="secondary"
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
