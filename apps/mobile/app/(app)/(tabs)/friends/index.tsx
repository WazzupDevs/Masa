import { router } from 'expo-router';
import { View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SnailLoader } from '@/components/Snail';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import {
  useFriends,
  useIncomingFriendRequests,
  useVenueChatRequests,
} from '@/features/friends/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';

// Arkadaşlar (docs/SPEC_V2.md §6.4): the friend list with DM threads, and the way to requests and
// the play history. No venue, position or active table of a friend anywhere.
export default function FriendsScreen() {
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const chatIncoming = useVenueChatRequests();
  const requestCount = (incoming.data?.length ?? 0) + (chatIncoming.data?.length ?? 0);

  return (
    <Screen edges={['top']}>
      <ScreenHeader title={tr.tabs.friends} />

      <Card tone="note" className="mt-3" onPress={() => router.push('/friends/requests')}>
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="bodyStrong" className="flex-1">
            {tr.friends.requestsAndHistory}
          </Text>
          {requestCount > 0 ? (
            <Tag variant="buzz" label={tr.friends.newRequests(requestCount)} />
          ) : null}
        </View>
      </Card>

      {friends.isPending ? (
        <View className="mt-12">
          <SnailLoader />
        </View>
      ) : friends.isError ? (
        <Text tone="danger" className="mt-8">
          {errorMessage(friends.error)}
        </Text>
      ) : friends.data.length === 0 ? (
        <EmptyState snail body={tr.friends.empty} />
      ) : (
        <View className="mt-4">
          {friends.data.map((f) => (
            <ListRow
              key={f.publicId}
              title={f.displayName ?? tr.profile.noName}
              meta={tr.friends.since(f.since)}
              leading={
                <Avatar
                  kind="profile"
                  size="lg"
                  name={f.displayName ?? tr.profile.noName}
                  photoUrl={f.photoUrl}
                />
              }
              trailing={f.unread ? <Tag variant="buzz" label={tr.friends.unread} /> : undefined}
              onPress={() =>
                f.threadId &&
                router.push({
                  pathname: '/friends/[threadId]',
                  params: {
                    threadId: f.threadId,
                    publicId: f.publicId,
                    name: f.displayName ?? '',
                  },
                })
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
