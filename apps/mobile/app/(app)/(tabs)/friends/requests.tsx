import type { ReportReason } from '@shared/chat.ts';
import { historyAction } from '@shared/friends.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Modal, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ReportModal } from '@/features/chat/ReportModal';
import { ConfirmWithReport } from '@/features/friends/ConfirmWithReport';
import {
  friendKeys,
  useIncomingFriendRequests,
  usePlayHistory,
  useSentFriendRequests,
} from '@/features/friends/queries';
import { useRetryAfterName } from '@/features/friends/useRetryAfterName';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { friendsApi, safetyApi } from '@/lib/api';

type Concept = 'tabu' | 'sohbet';
const concept = (c: string): Concept => (c === 'tabu' ? 'tabu' : 'sohbet');

// Gelen istekler, gönderilen istekler and the play history (docs/SPEC_V2.md §6.1, §6.2). Every
// action on another table goes through the caller's own history row; nothing here carries a
// profile id. The screen says "masa", not "kişi".
export default function RequestsScreen() {
  const queryClient = useQueryClient();
  const incoming = useIncomingFriendRequests();
  const sent = useSentFriendRequests();
  const history = usePlayHistory();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: friendKeys.all });

  type Action = { kind: 'request' | 'add'; historyId: string };
  const act = useMutation({
    mutationFn: ({ kind, historyId }: Action) =>
      kind === 'request' ? friendsApi.request(historyId) : friendsApi.addFromRoom(historyId),
    onSuccess: (_data, { kind }) =>
      kind === 'request'
        ? track('friend_request_sent', { source: 'history' })
        : track('friend_add_pressed', {}),
    onError: (err, action) => void askName(err, action),
    onSettled: refresh,
  });
  const runAction = useCallback((a: Action) => act.mutate(a), [act]);
  const askName = useRetryAfterName(runAction);

  type Answer = { requestId: string; accept: boolean };
  const respond = useMutation({
    mutationFn: ({ requestId, accept }: Answer) => friendsApi.respond(requestId, accept),
    onSuccess: (_data, { accept }) => {
      if (!accept) return;
      track('friend_request_accepted', {});
      track('friendship_created', { source: 'request' });
    },
    onError: (err, answer) => void askNameForAnswer(err, answer),
    onSettled: refresh,
  });
  const runAnswer = useCallback((a: Answer) => respond.mutate(a), [respond]);
  const askNameForAnswer = useRetryAfterName(runAnswer);

  const report = useMutation({
    mutationFn: ({ historyId, reason }: { historyId: string; reason: ReportReason }) =>
      safetyApi.reportHistory(historyId, reason),
    onSuccess: () => {
      track('report_submitted', {});
      setReporting(null);
      Alert.alert(tr.safety.reportSent);
    },
  });
  const block = useMutation({
    mutationFn: ({ historyId, reason }: { historyId: string; reason?: ReportReason }) =>
      safetyApi.blockHistory(historyId, reason),
    onSuccess: (_data, { reason }) => {
      track('block_created', {});
      if (reason) track('report_submitted', {});
      setBlocking(null);
    },
    onSettled: refresh,
  });

  return (
    <Screen>
      <Text className="text-3xl font-bold text-black">{tr.friends.requestsAndHistory}</Text>

      <Section title={tr.friends.incomingTitle}>
        {incoming.data?.length === 0 ? (
          <Text className="text-base text-neutral-500">{tr.friends.noIncoming}</Text>
        ) : null}
        {incoming.data?.map((r) => (
          <View key={r.request_id} className="gap-3 rounded-xl border border-neutral-200 p-4">
            <Text className="text-base text-black">
              {tr.friends.incoming(r.played_at, concept(r.concept), r.other_alias)}
            </Text>
            <Text className="text-sm text-neutral-500">{tr.friends.people(r.other_headcount)}</Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button
                  label={tr.friends.accept}
                  loading={respond.isPending && respond.variables.requestId === r.request_id}
                  disabled={respond.isPending}
                  onPress={() => respond.mutate({ requestId: r.request_id, accept: true })}
                />
              </View>
              <View className="flex-1">
                <Button
                  variant="secondary"
                  label={tr.friends.decline}
                  disabled={respond.isPending}
                  onPress={() => respond.mutate({ requestId: r.request_id, accept: false })}
                />
              </View>
            </View>
            <Button
              variant="secondary"
              label={tr.friends.more}
              onPress={() => setMenuFor(r.history_id)}
            />
          </View>
        ))}
        {respond.isError ? (
          <Text className="text-sm text-red-600">{errorMessage(respond.error)}</Text>
        ) : null}
      </Section>

      {sent.data && sent.data.length > 0 ? (
        <Section title={tr.friends.sentTitle}>
          {sent.data.map((r) => (
            <Text key={r.history_id} className="text-base text-neutral-700">
              {r.status === 'accepted'
                ? tr.friends.sentAccepted(r.other_alias)
                : tr.friends.sent(r.other_alias)}
            </Text>
          ))}
        </Section>
      ) : null}

      <Section title={tr.friends.historyTitle}>
        {history.data?.length === 0 ? (
          <Text className="text-base text-neutral-500">{tr.friends.noHistory}</Text>
        ) : null}
        {history.data?.map((h) => {
          const action = historyAction(h);
          return (
            <View key={h.id} className="gap-2 rounded-xl border border-neutral-200 p-4">
              <Text className="text-base font-semibold text-black">
                {tr.friends.historyRow(h.other_alias, concept(h.concept), h.played_at)}
              </Text>
              <Text className="text-sm text-neutral-500">
                {tr.friends.people(h.other_headcount)}
              </Text>
              {action === 'add_friend' ? (
                <Text className="text-sm text-neutral-500">{tr.friends.addFriendHint}</Text>
              ) : null}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button
                    label={
                      action === 'done'
                        ? tr.friends.actionDone
                        : action === 'add_friend'
                          ? tr.friends.addFriend
                          : tr.friends.sendRequest
                    }
                    disabled={action === 'done' || act.isPending}
                    loading={act.isPending && act.variables.historyId === h.id}
                    onPress={() =>
                      act.mutate({
                        kind: action === 'add_friend' ? 'add' : 'request',
                        historyId: h.id,
                      })
                    }
                  />
                </View>
                <View className="flex-1">
                  <Button
                    testID="history-more"
                    variant="secondary"
                    label={tr.friends.more}
                    onPress={() => setMenuFor(h.id)}
                  />
                </View>
              </View>
            </View>
          );
        })}
        {act.isError ? (
          <Text className="text-sm text-red-600">{errorMessage(act.error)}</Text>
        ) : null}
      </Section>

      <View className="mt-8">
        <Button variant="secondary" label={tr.friends.back} onPress={() => router.back()} />
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={menuFor !== null}
        onRequestClose={() => setMenuFor(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full gap-3 rounded-2xl bg-white p-6">
            <Text className="text-xl font-bold text-black">{tr.friends.moreTitle}</Text>
            <Button
              variant="secondary"
              label={tr.friends.report}
              onPress={() => {
                setReporting(menuFor);
                setMenuFor(null);
              }}
            />
            <Button
              testID="menu-block"
              variant="danger"
              label={tr.friends.block}
              onPress={() => {
                setBlocking(menuFor);
                setMenuFor(null);
              }}
            />
            <Button label={tr.common.cancel} onPress={() => setMenuFor(null)} />
          </View>
        </View>
      </Modal>

      <ReportModal
        visible={reporting !== null}
        pending={report.isPending}
        error={report.error}
        onReport={(reason) => reporting && report.mutate({ historyId: reporting, reason })}
        onClose={() => setReporting(null)}
      />
      <ConfirmWithReport
        visible={blocking !== null}
        title={tr.safety.blockConfirmTitle}
        hint={tr.friends.blockHint}
        confirmLabel={tr.friends.blockConfirm}
        pending={block.isPending}
        error={block.error}
        onConfirm={(reason) => blocking && block.mutate({ historyId: blocking, reason })}
        onClose={() => setBlocking(null)}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-8 gap-3">
      <Text className="text-sm font-semibold text-neutral-500">{title}</Text>
      {children}
    </View>
  );
}
