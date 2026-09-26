import type { ReportReason } from '@shared/chat.ts';
import { DM_MAX_LENGTH, prepareDm } from '@shared/friends.ts';
import { BROADCAST, dmChannel } from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
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

  const list = messages.data ?? [];
  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.back()}>
          <Text className="text-base text-neutral-600">{tr.friends.back}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setMenu(true)}>
          <Text className="text-base font-semibold text-black">{tr.friends.more}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/people/[publicId]', params: { publicId } })}
      >
        <Text className="mt-4 text-2xl font-bold text-black">{name}</Text>
      </Pressable>

      <View className="mt-6 flex-1 gap-2">
        {list.length === 0 && !messages.isPending ? (
          <Text className="text-base text-neutral-500">{tr.friends.noMessagesYet}</Text>
        ) : null}
        {[...list].reverse().map((m) => (
          <View
            key={m.id}
            className={`max-w-[80%] rounded-2xl px-4 py-2 ${m.from_me ? 'self-end bg-black' : 'self-start bg-neutral-100'}`}
          >
            <Text className={`text-base ${m.from_me ? 'text-white' : 'text-black'}`}>{m.body}</Text>
          </View>
        ))}
      </View>

      {send.isError ? (
        <Text className="mt-3 text-sm text-red-600">{errorMessage(send.error)}</Text>
      ) : null}
      <View className="mt-4 flex-row items-end gap-2">
        <TextInput
          testID="dm-input"
          className="min-h-12 flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black"
          placeholder={tr.dm.placeholder}
          value={draft}
          onChangeText={setDraft}
          maxLength={DM_MAX_LENGTH}
          multiline
        />
        <View className="w-24">
          <Button
            testID="dm-send"
            label={tr.dm.send}
            disabled={!body}
            loading={send.isPending}
            onPress={() => body && send.mutate(body)}
          />
        </View>
      </View>

      <Modal transparent animationType="fade" visible={menu} onRequestClose={() => setMenu(false)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full gap-3 rounded-2xl bg-white p-6">
            <Text className="text-xl font-bold text-black">{tr.friends.friendMenuTitle}</Text>
            <Button
              variant="secondary"
              label={tr.friends.viewProfile}
              onPress={() => {
                setMenu(false);
                router.push({ pathname: '/people/[publicId]', params: { publicId } });
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
            <Button label={tr.common.cancel} onPress={() => setMenu(false)} />
          </View>
        </View>
      </Modal>

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
    </Screen>
  );
}
