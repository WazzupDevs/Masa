import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReportReason } from '@shared/chat.ts';
import {
  prepareVenueMessage,
  senderLabel,
  VENUE_CHAT,
  type VenueChatMessage,
} from '@shared/venueChat.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { toRuns } from '@shared/chatRuns.ts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { Avatar, AVATAR_SIZE } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatScreen, DayLine, dayLabel } from '@/components/ChatScreen';
import { ChatTopBar } from '@/components/ChatTopBar';
import { Composer } from '@/components/Composer';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Sheet } from '@/components/Sheet';
import { Snail } from '@/components/Snail';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { Toggle } from '@/components/Toggle';
import { ReportModal } from '@/features/chat/ReportModal';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { ConfirmWithReport } from '@/features/friends/ConfirmWithReport';
import { toChatQuote, useReplyTarget } from '@/features/chat/messageExtras';
import { useVenueChat, useVenueChatReactions, venueChatKeys } from '@/features/venueChat/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { safetyApi, venueChatApi } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING } from '@/theme/tokens';

// "Profilimle yaz" is remembered on this phone only (docs/SPEC_V3.md §7.3).
const AS_PROFILE_KEY = 'venueChat.asProfile';

// The venue's chat room (docs/SPEC_V3.md §7): everyone with a live table at the venue reads and
// writes; a message goes with the table alias, or with the display name and no alias. Tapping a
// profiled sender opens their profile through the message; any other sender offers report and
// block.
export default function VenueChatScreen() {
  const { colors, shape } = useTheme();
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
  // docs/SPEC_V3.md §21: swipe a message to answer it, long press it for a reaction.
  const reply = useReplyTarget();
  const reactions = useVenueChatReactions(venueId);

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
    mutationFn: (text: string) =>
      reply.target
        ? venueChatApi.reply(venueId ?? '', text, asProfile, reply.target.id)
        : venueChatApi.send(venueId ?? '', text, asProfile),
    onSuccess: () => {
      setDraft('');
      reply.clear();
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

  const newest = messages.data?.[messages.data.length - 1];
  const runs = toRuns(
    messages.data ?? [],
    (m) => (m.fromMe ? '' : `${m.profiled ? 'p' : 'a'}:${senderLabel(m)}`),
    (m) => m.createdAt,
  );

  return (
    <ChatScreen
      testID="venue-chat-messages"
      startAtEnd
      newestKey={newest?.id}
      newestMine={newest?.fromMe}
      top={
        <ChatTopBar
          onBack={() => router.back()}
          title={tr.venueChat.title(venueName)}
          subtitle={tr.venueChat.open}
          leading={
            <View
              className="items-center justify-center"
              style={{
                width: AVATAR_SIZE.md,
                height: AVATAR_SIZE.md,
                borderRadius: shape.radius.pill,
                backgroundColor: colors.signal,
              }}
            >
              <Ionicons name="chatbubbles-outline" size={ICON.md} color={colors.onSignal} />
            </View>
          }
        />
      }
      composer={
        <Composer
          inputTestID="venue-chat-input"
          sendTestID="venue-chat-send"
          sendLabel={tr.venueChat.send}
          placeholder={tr.venueChat.placeholder}
          value={draft}
          onChangeText={setDraft}
          maxLength={VENUE_CHAT.maxLength}
          sendDisabled={!body}
          sending={send.isPending}
          onSend={() => body && send.mutate(body)}
          replyTo={reply.target?.quote}
          onCancelReply={reply.clear}
          counter={draft ? tr.chat.counter([...draft].length, VENUE_CHAT.maxLength) : undefined}
          above={
            <View>
              <Toggle
                compact
                label={tr.venueChat.asProfile}
                hint={asProfile ? tr.venueChat.asProfileOn : tr.venueChat.asProfileOff}
                value={asProfile}
                onChange={toggleProfile}
              />
              {send.isError ? (
                <Text variant="fine" tone="danger">
                  {errorMessage(send.error)}
                </Text>
              ) : null}
            </View>
          }
        />
      }
    >
      <Card tone="note">
        <View className="flex-row items-center gap-3">
          <Snail height={SPACING[9]} />
          <Text variant="fine" tone="text" className="flex-1">
            {tr.venueChat.hint}
          </Text>
        </View>
      </Card>
      {messages.isPending ? (
        <ActivityIndicator color={colors.muted} />
      ) : messages.data?.length === 0 ? (
        <View className="flex-1 justify-center">
          <EmptyState snail body={tr.venueChat.empty} />
        </View>
      ) : (
        runs.map(({ item: m, first, last, day }) => (
          <View key={m.id} className={first ? 'mt-1.5 gap-2' : 'gap-2'}>
            {day ? <DayLine label={dayLabel(day)} /> : null}
            <ChatBubble
              testID={m.fromMe ? 'venue-chat-mine' : 'venue-chat-theirs'}
              text={m.body}
              mine={m.fromMe}
              quote={toChatQuote(m.replyTo)}
              reactions={reactions.view(m.id, m.reactions)}
              onToggleReaction={(emoji) => reactions.pick(m.id, m.reactions, emoji)}
              onReact={(emoji) => reactions.pick(m.id, m.reactions, emoji)}
              onReply={() =>
                reply.setTarget({
                  id: m.id,
                  quote: { name: m.fromMe ? tr.chat.you : senderLabel(m), text: m.body },
                })
              }
              first={first}
              last={last}
              time={tr.chat.time(m.createdAt)}
              name={m.fromMe ? tr.venueChat.you : senderLabel(m)}
              avatar={
                m.fromMe ? undefined : m.profiled ? (
                  <Avatar kind="profile" name={senderLabel(m)} photoUrl={m.photoUrl} size="sm" />
                ) : (
                  <Avatar kind="table" alias={senderLabel(m)} size="sm" />
                )
              }
              tag={m.profiled ? <Tag label={tr.venueChat.profiled} variant="profiled" /> : null}
              onPressSender={m.fromMe ? undefined : () => openSender(m)}
            />
          </View>
        ))
      )}

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
    </ChatScreen>
  );
}
