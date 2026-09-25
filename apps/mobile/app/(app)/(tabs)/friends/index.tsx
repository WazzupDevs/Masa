import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useFriends, useIncomingFriendRequests } from '@/features/friends/queries';
import { ProfilePhoto } from '@/features/profile/ProfileCard';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';

// Arkadaşlar (docs/SPEC_V2.md §6.4): the friend list with DM threads, and the way to requests and
// the play history. No venue, position or active table of a friend anywhere.
export default function FriendsScreen() {
  const friends = useFriends();
  const incoming = useIncomingFriendRequests();
  const requestCount = incoming.data?.length ?? 0;

  return (
    <Screen>
      <Text className="text-3xl font-bold text-black">{tr.tabs.friends}</Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/friends/requests')}
        className="mt-6 min-h-12 flex-row items-center justify-between rounded-xl border border-neutral-200 px-4 py-3"
      >
        <Text className="text-base font-semibold text-black">{tr.friends.requestsAndHistory}</Text>
        {requestCount > 0 ? (
          <Text className="rounded-full bg-black px-3 py-1 text-sm font-semibold text-white">
            {tr.friends.newRequests(requestCount)}
          </Text>
        ) : null}
      </Pressable>

      {friends.isPending ? (
        <ActivityIndicator className="mt-12" />
      ) : friends.isError ? (
        <Text className="mt-8 text-base text-red-600">{errorMessage(friends.error)}</Text>
      ) : friends.data.length === 0 ? (
        <Text className="mt-8 text-base text-neutral-600">{tr.friends.empty}</Text>
      ) : (
        <View className="mt-6 gap-2">
          {friends.data.map((f) => (
            <Pressable
              key={f.publicId}
              accessibilityRole="button"
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
              className="min-h-16 flex-row items-center gap-3 rounded-xl border border-neutral-200 p-3"
            >
              <ProfilePhoto url={f.photoUrl} size="small" />
              <View className="flex-1">
                <Text className="text-base font-semibold text-black">{f.displayName}</Text>
                <Text className="text-sm text-neutral-500">{tr.friends.since(f.since)}</Text>
              </View>
              {f.unread ? (
                <Text className="rounded-full bg-black px-2 py-0.5 text-xs font-semibold text-white">
                  {tr.friends.unread}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
