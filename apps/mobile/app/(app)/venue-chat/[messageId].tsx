import type { ReportReason } from '@shared/chat.ts';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { ReportModal } from '@/features/chat/ReportModal';
import { ConfirmWithReport } from '@/features/friends/ConfirmWithReport';
import { ProfileCard } from '@/features/profile/ProfileCard';
import { useVenueChatProfile } from '@/features/venueChat/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { friendsApi, safetyApi } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';

// The sender of a profiled venue chat message, opened through the message (docs/SPEC_V3.md §7.5):
// no public_id. "Arkadaşlık isteği gönder" asks first, because the request shows the other side
// this account's name, age and photo.
export default function VenueChatProfileScreen() {
  const { colors } = useTheme();
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const view = useVenueChatProfile(messageId);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const request = useMutation({
    mutationFn: () => friendsApi.requestFromVenueChat(messageId),
    onSuccess: () => {
      track('friend_request_sent', { source: 'venue_chat' });
      setConfirming(false);
      setSent(true);
    },
  });
  const report = useMutation({
    mutationFn: (reason: ReportReason) => safetyApi.reportVenueChat(messageId, reason),
    onSuccess: () => {
      track('venue_chat_reported', {});
      setReporting(false);
      Alert.alert(tr.safety.reportSent);
    },
  });
  const block = useMutation({
    mutationFn: (reason: ReportReason | undefined) => safetyApi.blockVenueChat(messageId, reason),
    onSuccess: () => {
      track('block_created', {});
      setBlocking(false);
      router.back();
    },
  });

  return (
    <Screen>
      {view.isPending ? (
        <ActivityIndicator className="mt-16" color={colors.muted} />
      ) : !view.data ? (
        <EmptyState icon="eye-off-outline" body={tr.profile.notVisible} />
      ) : (
        <View className="mt-4" testID="venue-chat-profile">
          <ProfileCard profile={view.data} />
          <View className="mt-8 gap-2.5">
            {sent ? (
              <Text variant="fine" testID="venue-chat-request-sent">
                {tr.venueChat.requestSent}
              </Text>
            ) : (
              <Button
                testID="venue-chat-request"
                icon="person-add-outline"
                label={tr.venueChat.sendRequest}
                onPress={() => setConfirming(true)}
              />
            )}
            <Button
              variant="secondary"
              icon="flag-outline"
              label={tr.profile.report}
              onPress={() => setReporting(true)}
            />
            <Button
              variant="ghost"
              icon="ban-outline"
              label={tr.safety.block}
              onPress={() => setBlocking(true)}
            />
          </View>
        </View>
      )}
      <View className="mt-auto pt-8">
        <Button label={tr.profile.back} onPress={() => router.back()} />
      </View>
      <Sheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={tr.venueChat.requestConfirmTitle}
        icon="person-add-outline"
      >
        <Text>{tr.venueChat.requestConfirmBody}</Text>
        {request.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(request.error)}
          </Text>
        ) : null}
        <Button
          testID="venue-chat-request-confirm"
          label={tr.venueChat.requestConfirm}
          onPress={() => request.mutate()}
          loading={request.isPending}
        />
      </Sheet>
      <ReportModal
        visible={reporting}
        pending={report.isPending}
        error={report.error}
        onReport={(reason) => report.mutate(reason)}
        onClose={() => setReporting(false)}
      />
      <ConfirmWithReport
        visible={blocking}
        title={tr.venueChat.blockConfirmTitle}
        hint={tr.venueChat.blockConfirmBody}
        confirmLabel={tr.safety.blockConfirm}
        pending={block.isPending}
        error={block.error}
        onConfirm={(reason) => block.mutate(reason)}
        onClose={() => setBlocking(false)}
      />
    </Screen>
  );
}
