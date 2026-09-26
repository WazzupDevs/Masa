import type { ReportReason } from '@shared/chat.ts';
import { DM_MAX_LENGTH, prepareDm } from '@shared/friends.ts';
import { BROADCAST, dmChannel } from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
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
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

type Params = { threadId: string; publicId: string; name: string };

// A DM thread with a friend (docs/SPEC_V2.md §6.4). The dm: channel carries no data; the page is
// reread through dm_messages_page (`from_me`, never the sender's account id). Read state stays
// with the reader.
export default function DmScreen() {
  const { colors, shape } = useTheme();
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
      <View className="-mx-3 flex-row items-center justify-between">
        <IconButton icon="chevron-back" label={tr.friends.back} onPress={() => router.back()} />
        <IconButton
          icon="ellipsis-horizontal"
          label={tr.friends.more}
          onPress={() => setMenu(true)}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/people/[publicId]', params: { publicId } })}
        className="mt-1 self-start"
        style={{ minHeight: TOUCH.min }}
      >
        <Text variant="display">{name}</Text>
      </Pressable>

      <View className="mt-4 flex-1 gap-2">
        {list.length === 0 && !messages.isPending ? (
          <Text tone="muted">{tr.friends.noMessagesYet}</Text>
        ) : null}
        {[...list].reverse().map((m) => (
          <View
            key={m.id}
            style={{
              maxWidth: '80%',
              alignSelf: m.from_me ? 'flex-end' : 'flex-start',
              borderRadius: shape.radius.md,
              paddingHorizontal: SPACING[4],
              paddingVertical: SPACING[2],
              backgroundColor: m.from_me ? colors.accent : colors.surface2,
            }}
          >
            <Text tone={m.from_me ? 'onAccent' : 'text'}>{m.body}</Text>
          </View>
        ))}
      </View>

      {send.isError ? (
        <Text variant="fine" tone="danger" className="mt-3">
          {errorMessage(send.error)}
        </Text>
      ) : null}
      <View className="mt-4 flex-row items-end gap-2">
        <View className="flex-1">
          <Input
            accessibilityLabel={tr.dm.placeholder}
            placeholder={tr.dm.placeholder}
            value={draft}
            onChangeText={setDraft}
            maxLength={DM_MAX_LENGTH}
            multiline
          />
        </View>
        <Button
          label={tr.dm.send}
          disabled={!body}
          loading={send.isPending}
          onPress={() => body && send.mutate(body)}
        />
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)} title={tr.friends.friendMenuTitle}>
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
    </Screen>
  );
}
