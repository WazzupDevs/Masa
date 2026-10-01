import type { VenueChatIncoming } from '@shared/api/friends.ts';
import type { ReportReason } from '@shared/chat.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Quiet } from '@/components/Quiet';
import { Text } from '@/components/Text';
import { ConfirmWithReport } from '@/features/friends/ConfirmWithReport';
import { friendKeys } from '@/features/friends/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { friendsApi, safetyApi } from '@/lib/api';

// Friend requests from the venue chat (docs/SPEC_V3.md §7.5): the sender's name, age and photo
// (S6), never a public_id or a table alias. Accept, decline and block work on the request.
export function VenueChatRequests({ requests }: { requests: VenueChatIncoming[] }) {
  const queryClient = useQueryClient();
  const [blocking, setBlocking] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: friendKeys.all });

  const respond = useMutation({
    mutationFn: ({ requestId, accept }: { requestId: string; accept: boolean }) =>
      friendsApi.respond(requestId, accept),
    onSuccess: (_data, { accept }) => {
      if (!accept) return;
      track('friend_request_accepted', {});
      track('friendship_created', { source: 'request' });
    },
    onSettled: refresh,
  });
  const block = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: ReportReason }) =>
      safetyApi.blockFriendRequest(requestId, reason),
    onSuccess: (_data, { reason }) => {
      track('block_created', {});
      if (reason) track('report_submitted', {});
      setBlocking(null);
    },
    onSettled: refresh,
  });

  if (requests.length === 0) return null;
  return (
    <Quiet value>
      {requests.map((r) => (
        <Card key={r.requestId} testID="venue-chat-incoming">
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <ProfilePhoto url={r.photoUrl} name={r.displayName} size="small" />
              <Text variant="bodyStrong" className="flex-1">
                {tr.venueChat.incoming(r.venueName ?? '', r.displayName ?? '', r.age)}
              </Text>
            </View>
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Button
                  variant="secondary"
                  label={tr.friends.decline}
                  disabled={respond.isPending}
                  onPress={() => respond.mutate({ requestId: r.requestId, accept: false })}
                />
              </View>
              <View className="flex-1">
                <Button
                  label={tr.friends.accept}
                  loading={respond.isPending && respond.variables.requestId === r.requestId}
                  disabled={respond.isPending}
                  onPress={() => respond.mutate({ requestId: r.requestId, accept: true })}
                />
              </View>
            </View>
            <Text variant="fine">{tr.friends.declineNote}</Text>
            <Button
              variant="ghost"
              label={tr.safety.block}
              onPress={() => setBlocking(r.requestId)}
            />
          </View>
        </Card>
      ))}
      {respond.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(respond.error)}
        </Text>
      ) : null}
      <ConfirmWithReport
        visible={blocking !== null}
        title={tr.venueChat.blockConfirmTitle}
        hint={tr.venueChat.blockConfirmBody}
        confirmLabel={tr.safety.blockConfirm}
        pending={block.isPending}
        error={block.error}
        onConfirm={(reason) => blocking && block.mutate({ requestId: blocking, reason })}
        onClose={() => setBlocking(null)}
      />
    </Quiet>
  );
}
