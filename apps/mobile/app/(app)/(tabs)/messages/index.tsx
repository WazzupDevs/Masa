import { inboxStamp } from '@shared/dmInbox.ts';
import type { DmInboxThread } from '@shared/api/friends.ts';
import { type ReactNode, useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { DeliveryTicks } from '@/components/ChatBubble';
import { EmptyState } from '@/components/EmptyState';
import { Rise } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SnailLoader } from '@/components/Snail';
import { Text } from '@/components/Text';
import { openDm } from '@/features/friends/openDm';
import { useDmInbox } from '@/features/friends/queries';
import { useDmTyping } from '@/features/friends/useDmTyping';
import { NotificationsBell } from '@/features/notifications/Bell';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

// Mesajlar (docs/SPEC_V3.md §18.3; canvas: Aşama 5 · Geri bildirim): every friend, newest
// conversation first, from dm/inbox (the function signs the photos). A friend without messages
// shows "Henüz mesaj yok". A row opens the DM.
export default function MessagesScreen() {
  const inbox = useDmInbox();
  const now = useNow(60_000);

  return (
    <Screen edges={['top']}>
      <ScreenHeader title={tr.tabs.messages} trailing={<NotificationsBell />} />

      {inbox.isPending ? (
        <View className="mt-12">
          <SnailLoader />
        </View>
      ) : inbox.isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          body={errorMessage(inbox.error)}
          action={{ label: tr.common.retry, onPress: () => void inbox.refetch() }}
        />
      ) : inbox.data.length === 0 ? (
        <View className="flex-1 justify-center">
          <EmptyState snail title={tr.messages.empty} body={tr.messages.emptyHint} />
        </View>
      ) : (
        <View className="mt-2 gap-1.5">
          {inbox.data.map((t, i) => (
            <Rise key={t.publicId} index={i}>
              <InboxRow thread={t} now={new Date(now)} listen={i < TYPING_ROWS} />
            </Rise>
          ))}
        </View>
      )}
    </Screen>
  );
}

// Rows past this many don't listen for "yazıyor": a Realtime connection carries a limited number
// of channels, and the rows further down are off screen.
const TYPING_ROWS = 30;

// A conversation (canvas: Aşama 8 · Saha → Mesajlar, A): a ring round the photo, the name and the
// time on top, the last message or "yazıyor…" below. Unread: the ring and the counter in colour,
// the name and the line in bold.
function InboxRow({
  thread: t,
  now,
  listen,
}: {
  thread: DmInboxThread;
  now: Date;
  listen: boolean;
}) {
  const { colors, shape } = useTheme();
  const name = t.displayName ?? tr.profile.noName;
  const unread = t.unreadCount > 0;
  const threadId = t.threadId;
  const preview = <Preview thread={t} unread={unread} />;
  return (
    <Pressable
      testID={`inbox-${name}`}
      accessibilityRole="button"
      accessibilityLabel={tr.messages.row(name, t.lastBody ?? tr.messages.noMessage, t.unreadCount)}
      disabled={!threadId}
      onPress={
        threadId ? () => openDm({ threadId, publicId: t.publicId, name: t.displayName }) : undefined
      }
    >
      {({ pressed }) => (
        <View
          className="flex-row items-center"
          style={{
            gap: SPACING[3] + SPACING[0.5],
            paddingVertical: SPACING[2.5],
            paddingHorizontal: SPACING[1],
            opacity: pressed ? 0.7 : 1,
          }}
        >
          <View
            style={{
              padding: SPACING[0.5],
              borderRadius: shape.radius.pill,
              borderWidth: shape.stroke.feature,
              borderColor: unread ? colors.violet : colors.divider,
            }}
          >
            <Avatar kind="profile" size="lg" name={name} photoUrl={t.photoUrl} />
          </View>
          <View className="flex-1" style={{ gap: SPACING[0.5] }}>
            <View className="flex-row items-center gap-2">
              <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={1} className="flex-1">
                {name}
              </Text>
              {t.lastMessageAt ? (
                <Text variant="fine" color={unread ? colors.violet : undefined}>
                  {tr.messages.stamp(t.lastMessageAt, inboxStamp(t.lastMessageAt, now))}
                </Text>
              ) : null}
            </View>
            <View className="flex-row items-center gap-2">
              {threadId && listen ? (
                <TypingOr threadId={threadId} lastMessageAt={t.lastMessageAt}>
                  {preview}
                </TypingOr>
              ) : (
                preview
              )}
              {unread ? <UnreadCount count={t.unreadCount} /> : null}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// The last message: the ticks on the own one, bold when unread.
function Preview({ thread: t, unread }: { thread: DmInboxThread; unread: boolean }) {
  return (
    <View className="flex-1 flex-row items-center gap-1">
      {t.lastFromMe && t.lastStatus ? <DeliveryTicks delivery={t.lastStatus} /> : null}
      <Text
        variant={unread ? 'bodyStrong' : 'fine'}
        tone={t.lastBody ? undefined : 'muted'}
        numberOfLines={1}
        className="flex-1"
      >
        {t.lastBody ?? tr.messages.noMessage}
      </Text>
    </View>
  );
}

// "yazıyor…" in place of the last message while the friend types (dm_typing, as in the DM).
function TypingOr({
  threadId,
  lastMessageAt,
  children,
}: {
  threadId: string;
  lastMessageAt: string | null;
  children: ReactNode;
}) {
  const { typing, clearTyping } = useDmTyping(threadId);
  // A new message arrived: the dots go at once.
  const seen = useRef(lastMessageAt);
  useEffect(() => {
    if (lastMessageAt === seen.current) return;
    seen.current = lastMessageAt;
    clearTyping();
  }, [lastMessageAt, clearTyping]);
  if (!typing) return children;
  return (
    <View className="flex-1" testID="inbox-typing">
      <Text variant="bodyStrong" tone="success" numberOfLines={1}>
        {tr.messages.typing}
      </Text>
    </View>
  );
}

function UnreadCount({ count }: { count: number }) {
  const { colors, shape } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={tr.messages.unread(count)}
      className="items-center justify-center"
      style={{
        minWidth: SPACING[5] + SPACING[0.5],
        height: SPACING[5] + SPACING[0.5],
        paddingHorizontal: SPACING[1.5],
        borderRadius: shape.radius.pill,
        backgroundColor: colors.violet,
      }}
    >
      <Text variant="caption" tone="onViolet">
        {String(count)}
      </Text>
    </View>
  );
}
