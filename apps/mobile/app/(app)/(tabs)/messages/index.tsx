import { inboxStamp } from '@shared/dmInbox.ts';
import type { DmInboxThread } from '@shared/api/friends.ts';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { DeliveryTicks } from '@/components/ChatBubble';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Rise } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SnailLoader } from '@/components/Snail';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { openDm } from '@/features/friends/openDm';
import { useDmInbox } from '@/features/friends/queries';
import { NotificationsBell } from '@/features/notifications/Bell';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { useNow } from '@/lib/useNow';

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
        <View className="mt-3 gap-2.5">
          {inbox.data.map((t, i) => (
            <Rise key={t.publicId} index={i}>
              <InboxRow thread={t} now={new Date(now)} />
            </Rise>
          ))}
        </View>
      )}
    </Screen>
  );
}

function InboxRow({ thread: t, now }: { thread: DmInboxThread; now: Date }) {
  const name = t.displayName ?? tr.profile.noName;
  const unread = t.unreadCount > 0;
  const preview = t.lastBody ?? tr.messages.noMessage;
  const threadId = t.threadId;
  return (
    <ListRow
      card
      title={name}
      testID={`inbox-${name}`}
      leading={<Avatar kind="profile" size="xl" name={name} photoUrl={t.photoUrl} />}
      below={
        <View className="flex-row items-center gap-1">
          {t.lastFromMe && t.lastStatus ? <DeliveryTicks delivery={t.lastStatus} /> : null}
          <Text
            variant={unread ? 'bodyStrong' : 'fine'}
            tone={t.lastBody ? undefined : 'muted'}
            numberOfLines={1}
            className="flex-1"
          >
            {preview}
          </Text>
        </View>
      }
      trailing={
        <View className="items-end gap-1.5">
          {t.lastMessageAt ? (
            <Text variant={unread ? 'bodyStrong' : 'fine'}>
              {tr.messages.stamp(t.lastMessageAt, inboxStamp(t.lastMessageAt, now))}
            </Text>
          ) : null}
          {unread ? (
            <View accessible accessibilityLabel={tr.messages.unread(t.unreadCount)}>
              <Tag variant="accent" label={String(t.unreadCount)} />
            </View>
          ) : null}
        </View>
      }
      onPress={
        threadId ? () => openDm({ threadId, publicId: t.publicId, name: t.displayName }) : undefined
      }
    />
  );
}
