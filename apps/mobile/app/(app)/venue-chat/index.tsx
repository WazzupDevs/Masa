import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReportReason } from '@shared/chat.ts';
import {
  prepareVenueMessage,
  senderLabel,
  VENUE_CHAT,
  type VenueChatMessage,
} from '@shared/venueChat.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { Button } from '@/components/Button';
import { ChatBubble } from '@/components/ChatBubble';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/Input';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Sheet } from '@/components/Sheet';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { Toggle } from '@/components/Toggle';
import { ReportModal } from '@/features/chat/ReportModal';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { ConfirmWithReport } from '@/features/friends/ConfirmWithReport';
import { useVenueChat, venueChatKeys } from '@/features/venueChat/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { safetyApi, venueChatApi } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';

// "Profilimle yaz" is remembered on this phone only (docs/SPEC_V3.md §7.3).
const AS_PROFILE_KEY = 'venueChat.asProfile';

// The venue's chat room (docs/SPEC_V3.md §7): everyone with a live table at the venue reads and
// writes; a message goes with the table alias, or with the display name and no alias. Tapping a
// profiled sender opens their profile through the message; any other sender offers report and
// block.
export default function VenueChatScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const table = useActiveTable();
  const venueId = table.data?.venue_id;
  const venueName = table.data?.venue?.name ?? '';
  const messages = useVenueChat(venueId);
  const [draft, setDraft] = useState('');
  const [asProfile, setAsProfile] = useState(false);
  const [menuFor, setMenuFor] = useState<VenueChatMessage | null>(null);
  const [reporting, setReporting] = useState<VenueChatMessage | null>(null);
  const [blocking, setBlocking] = useState<VenueChatMessage | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(AS_PROFILE_KEY)
      .then((raw) => setAsProfile(raw === '1'))
      .catch(() => undefined);
  }, []);
  const toggleProfile = () => {
    const next = !asProfile;
    setAsProfile(next);
    void AsyncStorage.setItem(AS_PROFILE_KEY, next ? '1' : '0').catch(() => undefined);
  };

  const refresh = () => {
    if (venueId) void queryClient.invalidateQueries({ queryKey: venueChatKeys.messages(venueId) });
  };
  const send = useMutation({
    mutationFn: (text: string) => venueChatApi.send(venueId ?? '', text, asProfile),
    onSuccess: () => {
      setDraft('');
      track('venue_chat_sent', { profiled: asProfile });
      refresh();
    },
  });
  const report = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: ReportReason }) =>
      safetyApi.reportVenueChat(id, reason),
    onSuccess: () => {
      track('venue_chat_reported', {});
      setReporting(null);
      Alert.alert(tr.safety.reportSent);
      refresh();
    },
  });
  const block = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: ReportReason | undefined }) =>
      safetyApi.blockVenueChat(id, reason),
    onSuccess: () => {
      setBlocking(null);
      refresh();
    },
  });

  const body = prepareVenueMessage(draft);
  const openSender = (m: VenueChatMessage) => {
    if (m.profiled) {
      router.push({ pathname: '/venue-chat/[messageId]', params: { messageId: m.id } });
    } else {
      setMenuFor(m);
    }
  };

  if (!table.isPending && !venueId) {
    return (
      <Screen>
        <ScreenHeader title={tr.venueChat.open} onBack={() => router.back()} />
        <EmptyState icon="chatbubbles-outline" body={tr.venueChat.noTable} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={tr.venueChat.title(venueName)}
        subtitle={tr.venueChat.hint}
        onBack={() => router.back()}
      />
      <View className="mt-4 gap-3" testID="venue-chat-messages">
        {messages.isPending ? (
          <ActivityIndicator color={colors.muted} />
        ) : messages.data?.length === 0 ? (
          <Text variant="fine">{tr.venueChat.empty}</Text>
        ) : (
          messages.data?.map((m) => (
            <ChatBubble
              key={m.id}
              testID={m.fromMe ? 'venue-chat-mine' : 'venue-chat-theirs'}
              text={m.body}
              mine={m.fromMe}
              name={m.fromMe ? tr.venueChat.you : senderLabel(m)}
              tag={m.profiled ? <Tag label={tr.venueChat.profiled} variant="profiled" /> : null}
              onPressSender={m.fromMe ? undefined : () => openSender(m)}
            />
          ))
        )}
      </View>

      <View className="mt-auto gap-2 pt-6">
        <Toggle
          label={tr.venueChat.asProfile}
          hint={asProfile ? tr.venueChat.asProfileOn : tr.venueChat.asProfileOff}
          value={asProfile}
          onChange={toggleProfile}
        />
        <View className="flex-row items-start gap-2">
          <View className="flex-1">
            <Input
              testID="venue-chat-input"
              accessibilityLabel={tr.venueChat.placeholder}
              placeholder={tr.venueChat.placeholder}
              value={draft}
              onChangeText={setDraft}
              maxLength={VENUE_CHAT.maxLength}
              counter={tr.chat.counter([...draft].length, VENUE_CHAT.maxLength)}
            />
          </View>
          <Button
            testID="venue-chat-send"
            label={tr.venueChat.send}
            disabled={!body || send.isPending}
            onPress={() => body && send.mutate(body)}
          />
        </View>
        {send.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(send.error)}
          </Text>
        ) : null}
      </View>

      <Sheet
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={tr.venueChat.messageMenu}
        icon="chatbubble-outline"
      >
        <ListRow
          title={tr.safety.report}
          accessibilityRole="button"
          onPress={() => {
            setReporting(menuFor);
            setMenuFor(null);
          }}
        />
        <ListRow
          title={tr.safety.block}
          accessibilityRole="button"
          onPress={() => {
            setBlocking(menuFor);
            setMenuFor(null);
          }}
        />
      </Sheet>
      <ReportModal
        visible={reporting !== null}
        pending={report.isPending}
        error={report.error}
        onReport={(reason) => reporting && report.mutate({ id: reporting.id, reason })}
        onClose={() => setReporting(null)}
      />
      <ConfirmWithReport
        visible={blocking !== null}
        title={tr.venueChat.blockConfirmTitle}
        hint={tr.venueChat.blockConfirmBody}
        confirmLabel={tr.safety.blockConfirm}
        pending={block.isPending}
        error={block.error}
        onConfirm={(reason) => blocking && block.mutate({ id: blocking.id, reason })}
        onClose={() => setBlocking(null)}
      />
    </Screen>
  );
}
