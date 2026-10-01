import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Rise } from '@/components/motion';
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
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, TOUCH } from '@/theme/tokens';

// Arkadaşlar (docs/SPEC_V2.md §6.4): the friend list with DM threads, and the way to requests and
// the play history. No venue, position or active table of a friend anywhere.
export default function FriendsScreen() {
  const { colors, shape } = useTheme();
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const chatIncoming = useVenueChatRequests();
  const requestCount = (incoming.data?.length ?? 0) + (chatIncoming.data?.length ?? 0);

  return (
    <Screen edges={['top']}>
      <ScreenHeader title={tr.tabs.friends} />

      <View className="mt-3">
        <ListRow
          card
          title={tr.friends.requestsAndHistory}
          meta={requestCount > 0 ? tr.friends.newRequests(requestCount) : undefined}
          onPress={() => router.push('/friends/requests')}
          leading={
            <View
              className="items-center justify-center"
              style={{
                width: TOUCH.button,
                height: TOUCH.button,
                borderRadius: shape.radius.pill,
                backgroundColor: colors.signal,
              }}
            >
              <Ionicons name="people-outline" size={ICON.lg} color={colors.onSignal} />
            </View>
          }
          trailing={
            requestCount > 0 ? <Tag variant="accent" label={String(requestCount)} /> : undefined
          }
        />
      </View>

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
        <View className="mt-3 gap-3">
          {friends.data.map((f, i) => (
            <Rise key={f.publicId} index={i}>
              <ListRow
                card
                title={f.displayName ?? tr.profile.noName}
                meta={tr.friends.since(f.since)}
                leading={
                  <Avatar
                    kind="profile"
                    size="xl"
                    name={f.displayName ?? tr.profile.noName}
                    photoUrl={f.photoUrl}
                  />
                }
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
            </Rise>
          ))}
        </View>
      )}
    </Screen>
  );
}
