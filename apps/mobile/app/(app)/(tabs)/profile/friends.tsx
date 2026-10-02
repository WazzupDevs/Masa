import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { ListRow } from '@/components/ListRow';
import { Rise } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SnailLoader } from '@/components/Snail';
import { Text } from '@/components/Text';
import { useFriends } from '@/features/friends/queries';
import { openDm } from '@/features/friends/openDm';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';

// Arkadaşlar, under Profil (docs/SPEC_V3.md §18.3): a row opens the friend's profile, its message
// button the DM. Removing and blocking stay where they were (the DM menu, the profile). No venue,
// position or active table of a friend anywhere.
export default function FriendsScreen() {
  const friends = useFriends();

  return (
    <Screen>
      <ScreenHeader title={tr.profile.friends} onBack={() => router.back()} />

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
          {friends.data.map((f, i) => {
            const name = f.displayName ?? tr.profile.noName;
            return (
              <Rise key={f.publicId} index={i}>
                <ListRow
                  card
                  title={name}
                  meta={tr.friends.since(f.since)}
                  leading={<Avatar kind="profile" size="xl" name={name} photoUrl={f.photoUrl} />}
                  trailing={
                    f.threadId ? (
                      <IconButton
                        icon="chatbubble-outline"
                        label={tr.friends.message(name)}
                        onPress={() =>
                          f.threadId &&
                          openDm({
                            threadId: f.threadId,
                            publicId: f.publicId,
                            name: f.displayName,
                          })
                        }
                      />
                    ) : undefined
                  }
                  onPress={() =>
                    router.push({
                      pathname: '/people/[publicId]',
                      params: { publicId: f.publicId },
                    })
                  }
                />
              </Rise>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
