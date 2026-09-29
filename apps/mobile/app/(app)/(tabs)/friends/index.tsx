import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { useFriends, useIncomingFriendRequests } from '@/features/friends/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';

// Arkadaşlar (docs/SPEC_V2.md §6.4): the friend list with DM threads, and the way to requests and
// the play history. No venue, position or active table of a friend anywhere.
export default function FriendsScreen() {
  const { colors } = useTheme();
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const requestCount = incoming.data?.length ?? 0;

  return (
    <Screen edges={['top']}>
      <ScreenHeader title={tr.tabs.friends} />

      <Card className="mt-3" onPress={() => router.push('/friends/requests')}>
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="bodyStrong" className="flex-1">
            {tr.friends.requestsAndHistory}
          </Text>
          {requestCount > 0 ? (
            <Tag variant="accent" label={tr.friends.newRequests(requestCount)} />
          ) : null}
        </View>
      </Card>

      {friends.isPending ? (
        <ActivityIndicator className="mt-12" color={colors.muted} />
      ) : friends.isError ? (
        <Text tone="danger" className="mt-8">
          {errorMessage(friends.error)}
        </Text>
      ) : friends.data.length === 0 ? (
        <EmptyState icon="people-outline" body={tr.friends.empty} />
      ) : (
        <View className="mt-4">
          {friends.data.map((f) => (
            <ListRow
              key={f.publicId}
              title={f.displayName ?? tr.profile.noName}
              meta={tr.friends.since(f.since)}
              leading={<ProfilePhoto url={f.photoUrl} name={f.displayName} size="small" />}
              trailing={f.unread ? <Tag variant="accent" label={tr.friends.unread} /> : undefined}
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
